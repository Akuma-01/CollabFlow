import { IncomingMessage, Server } from 'node:http';
import { Duplex } from 'node:stream';
import { parseCookie } from 'cookie';
import { WebSocket, WebSocketServer } from 'ws';
import pool from '../config/db';
import { verifyAccessToken } from '../services/token.service';
import { AppError } from '../utils/AppError';
import { NotificationListener } from './listener';
import { runtimeConfig } from '../config/runtime';

interface Identity { id: number; sid: string; exp: number }
interface Peer extends Identity { ws: WebSocket; projectId: number; alive: boolean; ready: boolean }
interface Access { id: string; user_id: number; can_read: boolean }
interface Options { heartbeatMs?: number; reconnectDelayMs?: number; maxConnections?: number; maxPerSession?: number }

function reject(socket: Duplex, status: number): void {
	if (socket.destroyed) return;
	const phrase = ({ 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 429: 'Too Many Requests', 503: 'Service Unavailable' } as Record<number, string>)[status];
	socket.end(`HTTP/1.1 ${status} ${phrase}\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n`, () => socket.destroy());
}

export async function startProjectRealtime(server: Server, options: Options = {}) {
	const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
	const rooms = new Map<number, Set<Peer>>();
	const peers = new Set<Peer>();
	const handshakes = new Set<Duplex>();
	const dirty = new Set<number>();
	const origin = runtimeConfig.frontendOrigin;
	let stopped = false;
	let flushing = false;
	let heartbeatRunning = false;
	const maxConnections = options.maxConnections ?? 1000;
	const maxPerSession = options.maxPerSession ?? 10;

	function closePeer(peer: Peer, code: number, reason: string) {
		if (peer.ws.readyState !== WebSocket.OPEN) return;
		peer.ws.close(code, reason);
	}

	async function access(projectId: number, identities: Identity[]): Promise<Map<string, Access>> {
		const { rows } = await pool.query<Access>(
			`SELECT s.id, s.user_id, EXISTS (
				SELECT 1 FROM projects p WHERE p.id = $2 AND (p.owner_id = s.user_id OR EXISTS (
					SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = s.user_id
				))
			) AS can_read FROM auth_sessions s
			WHERE s.id = ANY($1::uuid[]) AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()`,
			[[...new Set(identities.map(peer => peer.sid))], projectId]
		);
		return new Map(rows.map(row => [row.id, row]));
	}

	function permission(identity: Identity, allowed: Map<string, Access>): number | null {
		const row = allowed.get(identity.sid);
		if (identity.exp * 1000 <= Date.now() || !row || row.user_id !== identity.id) return 4001;
		return row.can_read ? null : 4003;
	}

	async function deliver(projectId: number, type?: 'project.ready' | 'project.changed', recipients = [...(rooms.get(projectId) ?? [])]) {
		if (!recipients.length || !listener.ready || stopped) return;
		try {
			const allowed = await access(projectId, recipients);
			if (!listener.ready || stopped) return;
			for (const peer of recipients) {
				const denied = permission(peer, allowed);
				if (denied) { closePeer(peer, denied, denied === 4001 ? 'Authentication required' : 'Project access lost'); continue; }
				if (peer.ws.readyState !== WebSocket.OPEN || !type || (type === 'project.changed' && !peer.ready)) continue;
				if (peer.ws.bufferedAmount > 64 * 1024) { closePeer(peer, 1013, 'Slow consumer; reconnect'); continue; }
				if (type === 'project.ready') peer.ready = true;
				peer.ws.send(JSON.stringify({ type, projectId }));
			}
		} catch {
			for (const peer of recipients) closePeer(peer, 1013, 'Authorization unavailable; reconnect');
		}
	}

	async function flush() {
		if (flushing) return;
		flushing = true;
		try {
			while (dirty.size && !stopped && listener.ready) {
				const id = dirty.values().next().value!;
				dirty.delete(id);
				await deliver(id, 'project.changed');
			}
		} finally { flushing = false; }
	}

	const listener = new NotificationListener(
		id => { if (rooms.has(id)) { dirty.add(id); void flush(); } },
		sid => { for (const peer of peers) if (peer.sid === sid) closePeer(peer, 4001, 'Authentication required'); },
		() => { dirty.clear(); for (const peer of peers) closePeer(peer, 1013, 'Notification connection lost; reconnect'); },
		options.reconnectDelayMs,
	);

	function joined(ws: WebSocket, projectId: number, identity: Identity) {
		const peer: Peer = { ...identity, ws, projectId, alive: true, ready: false };
		peers.add(peer);
		if (!rooms.has(projectId)) rooms.set(projectId, new Set());
		rooms.get(projectId)!.add(peer);
		const expiry = setTimeout(() => closePeer(peer, 4001, 'Access token expired; reconnect'), Math.max(0, identity.exp * 1000 - Date.now()));
		expiry.unref();
		ws.on('pong', () => { peer.alive = true; });
		// Clients mutate through the existing validated REST API. No client can
		// choose a room after the handshake or relay forged change notifications.
		ws.on('message', () => closePeer(peer, 1008, 'Use the HTTP API for mutations'));
		ws.on('error', () => ws.terminate());
		ws.once('close', () => {
			clearTimeout(expiry);
			peers.delete(peer);
			rooms.get(projectId)?.delete(peer);
			if (!rooms.get(projectId)?.size) rooms.delete(projectId);
		});
		// Recheck after registering: a removal may have committed while upgrade
		// authorization was in flight, before the connection entered its room.
		void deliver(projectId, 'project.ready', [peer]);
	}

	const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
		socket.on('error', () => socket.destroy());
		if (handshakes.size >= 128) { reject(socket, 429); return; }
		handshakes.add(socket);
		const timeout = setTimeout(() => socket.destroy(), 5000);
		timeout.unref();
		void (async () => {
			if (stopped || !listener.ready) throw new AppError('Unavailable', 503);
			const url = new URL(request.url ?? '/', 'http://localhost');
			const match = /^\/projects\/([1-9]\d{0,9})\/events$/.exec(url.pathname);
			if (!match || Number(match[1]) > 2147483647) throw new AppError('Not found', 404);
			if (url.search || request.method !== 'GET') throw new AppError('Invalid request', 400);
			if (request.headers.origin !== origin) throw new AppError('Untrusted origin', 403);
			const bearer = /^Bearer ([^ ]+)$/.exec(request.headers.authorization ?? '')?.[1];
			const token = parseCookie(request.headers.cookie ?? '').token || bearer;
			if (!token) throw new AppError('Authentication required', 401);
			const identity = verifyAccessToken(token);
			const projectId = Number(match[1]);
			const denied = permission(identity, await access(projectId, [identity]));
			if (denied) throw new AppError('Access denied', denied === 4001 ? 401 : 403);
			if (stopped || !listener.ready) throw new AppError('Unavailable', 503);
			if (peers.size >= maxConnections || [...peers].filter(peer => peer.sid === identity.sid).length >= maxPerSession) {
				throw new AppError('Connection limit', 429);
			}
			if (!socket.destroyed) wss.handleUpgrade(request, socket, head, ws => joined(ws, projectId, identity));
		})().catch(error => reject(socket, error instanceof AppError ? error.status : 503))
			.finally(() => { clearTimeout(timeout); handshakes.delete(socket); });
	};

	try { await listener.start(); }
	catch (error) { wss.close(); throw error; }
	server.on('upgrade', upgrade);
	const heartbeat = setInterval(() => {
		for (const peer of peers) {
			if (!peer.alive) { peer.ws.terminate(); continue; }
			peer.alive = false;
			if (peer.ws.readyState === WebSocket.OPEN) peer.ws.ping();
		}
		if (heartbeatRunning) return;
		heartbeatRunning = true;
		void (async () => { for (const id of rooms.keys()) await deliver(id); })()
			.finally(() => { heartbeatRunning = false; });
	}, options.heartbeatMs ?? 30_000);
	heartbeat.unref();

	return {
		isReady: () => !stopped && listener.ready,
		async close(): Promise<void> {
			stopped = true;
			server.off('upgrade', upgrade);
			clearInterval(heartbeat);
			dirty.clear();
			for (const socket of handshakes) socket.destroy();
			for (const peer of peers) peer.ws.terminate();
			await listener.stop();
			await new Promise<void>(resolve => wss.close(() => resolve()));
		},
	};
}
