import { ApiError } from './api';

export type SyncStatus = 'connecting' | 'live' | 'reconnecting';
export type BeginMutation = (key: string) => (() => void) | undefined;

export function projectSocketUrl(baseUrl: string, projectId: string): string {
	const url = new URL(`${baseUrl.replace(/\/$/, '')}/projects/${encodeURIComponent(projectId)}/events`);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	return url.toString();
}

// A hint invalidates any older read. Local writes also invalidate reads and hold
// snapshot application until they settle; one authoritative read follows them.
export function createProjectSync<T>(options: {
	projectId: number;
	read: () => Promise<T>;
	connect: () => WebSocket;
	onSnapshot: (snapshot: T) => void;
	onStatus: (status: SyncStatus) => void;
	onDenied: (status: number) => void;
	onPending: (keys: ReadonlySet<string>) => void;
}) {
	let stopped = false;
	let socket: WebSocket | null = null;
	let ready = false;
	let busy = false;
	let dirty = false;
	let version = 0;
	let attempts = 0;
	let refreshTimer: ReturnType<typeof setTimeout> | undefined;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let readyTimer: ReturnType<typeof setTimeout> | undefined;
	const pending = new Set<string>();

	function detach() {
		clearTimeout(readyTimer);
		if (socket) {
			socket.onmessage = socket.onclose = socket.onerror = null;
			socket.close();
			socket = null;
		}
		ready = false;
	}
	function stop() {
		stopped = true;
		clearTimeout(refreshTimer);
		clearTimeout(retryTimer);
		detach();
	}
	function deny(status: number) {
		stop();
		options.onDenied(status);
	}
	function retry() {
		if (stopped) return;
		options.onStatus('reconnecting');
		if (retryTimer) return;
		// Jitter prevents tabs from reconnecting together after an API restart.
		const delay = Math.min(30_000, 500 * 2 ** Math.min(attempts++, 6) * (0.8 + Math.random() * 0.4));
		retryTimer = setTimeout(() => { retryTimer = undefined; invalidate(); }, delay);
	}
	function connect() {
		if (socket || retryTimer || stopped) return;
		try {
			const peer = options.connect();
			socket = peer;
			peer.onmessage = event => {
				if (socket !== peer || stopped) return;
				let message;
				try { message = JSON.parse(event.data); } catch { return; }
				if (!message || message.projectId !== options.projectId) return;
				if (message.type === 'project.ready' && !ready) {
					clearTimeout(readyTimer);
					ready = true;
					invalidate(); // Close the initial-fetch / subscription gap.
				} else if (message.type === 'project.changed' && ready) invalidate();
			};
			peer.onclose = event => {
				if (socket !== peer || stopped) return;
				detach();
				version++;
				if (event.code === 4003) deny(403);
				else retry(); // HTTP reads restore auth and detect failed upgrades.
			};
			peer.onerror = () => { if (socket === peer) { detach(); version++; retry(); } };
			readyTimer = setTimeout(() => { detach(); retry(); }, 10_000);
		} catch { retry(); }
	}
	async function refresh() {
		refreshTimer = undefined;
		if (stopped || busy || pending.size) return;
		dirty = false;
		busy = true;
		const requestedVersion = version;
		try {
			const snapshot = await options.read();
			if (stopped) return;
			if (requestedVersion === version && !pending.size) {
				options.onSnapshot(snapshot);
				if (ready) { attempts = 0; options.onStatus('live'); }
				connect();
			}
		} catch (error) {
			if (stopped) return;
			if (error instanceof ApiError && [401, 403, 404].includes(error.status)) deny(error.status);
			else retry();
		} finally {
			busy = false;
			if (dirty && !stopped && !pending.size && !retryTimer) schedule();
		}
	}
	function schedule() {
		if (!refreshTimer) refreshTimer = setTimeout(() => { void refresh(); }, 75);
	}
	function invalidate() {
		if (stopped) return;
		version++;
		dirty = true;
		schedule();
	}
	const beginMutation: BeginMutation = key => {
		if (stopped || pending.has(key)) return;
		pending.add(key);
		version++;
		options.onPending(new Set(pending));
		let finished = false;
		return () => {
			if (finished || stopped) return;
			finished = true;
			pending.delete(key);
			options.onPending(new Set(pending));
			invalidate();
		};
	};
	return {
		start: invalidate,
		stop,
		beginMutation,
		refresh: () => {
			if (stopped) return;
			clearTimeout(retryTimer);
			retryTimer = undefined;
			invalidate();
		},
	};
}
