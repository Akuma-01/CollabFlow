import { Client } from 'pg';
import { databaseConfig } from '../config/db';
import { PROJECT_CHANNEL, SESSION_CHANNEL } from './notifications';

// LISTEN requires a persistent connection, outside the request pool and outside
// transactions. A lost connection creates a delivery gap: disconnect consumers
// so they reconnect and refetch instead of silently retaining stale state.
export class NotificationListener {
	private client: Client | null = null;
	private reconnect: NodeJS.Timeout | undefined;
	private stopped = false;
	private delay: number;
	ready = false;

	constructor(
		private readonly onProject: (id: number) => void,
		private readonly onSession: (sid: string) => void,
		private readonly onUnavailable: () => void,
		private readonly reconnectDelayMs = 500,
	) { this.delay = reconnectDelayMs; }

	async start(): Promise<void> {
		try { await this.connect(); }
		catch (error) { await this.stop(); throw error; }
	}

	private async connect(): Promise<void> {
		if (this.stopped) return;
		const client = new Client({ ...databaseConfig, application_name: 'collabflow-realtime', connectionTimeoutMillis: 5000, query_timeout: 5000, keepAlive: true });
		this.client = client;
		const disconnected = () => {
			if (this.client !== client || this.stopped) return;
			this.client = null;
			this.ready = false;
			this.onUnavailable();
			void client.end().catch(() => {});
			this.retry();
		};
		client.on('error', disconnected);
		client.on('end', disconnected);
		client.on('notification', message => {
			if (!this.ready || this.client !== client || !message.payload) return;
			if (message.channel === PROJECT_CHANNEL && /^[1-9]\d{0,9}$/.test(message.payload)) {
				const id = Number(message.payload);
				if (id <= 2147483647) this.onProject(id);
			} else if (message.channel === SESSION_CHANNEL && /^[a-f0-9-]{36}$/.test(message.payload)) {
				this.onSession(message.payload);
			}
		});
		try {
			await client.connect();
			await client.query(`LISTEN ${PROJECT_CHANNEL}`);
			await client.query(`LISTEN ${SESSION_CHANNEL}`);
			if (this.stopped || this.client !== client) throw new Error('Notification connection closed during startup');
			this.ready = true;
			this.delay = this.reconnectDelayMs;
		} catch (error) {
			if (this.client === client) this.client = null;
			await client.end().catch(() => {});
			throw error;
		}
	}

	private retry(): void {
		if (this.stopped || this.reconnect) return;
		this.reconnect = setTimeout(() => {
			this.reconnect = undefined;
			void this.connect().catch(() => this.retry());
		}, this.delay);
		this.reconnect.unref();
		this.delay = Math.min(this.delay * 2, 30_000);
	}

	async stop(): Promise<void> {
		this.stopped = true;
		this.ready = false;
		clearTimeout(this.reconnect);
		const client = this.client;
		this.client = null;
		await client?.end().catch(() => {});
	}
}
