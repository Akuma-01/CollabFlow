import { Express } from 'express';
import { createServer } from 'node:http';
import { runtimeConfig } from '../config/runtime';
import { startProjectRealtime } from '../realtime/server';
import { HealthState, verifyDatabase } from './health';

export async function startHttpServer(app: Express, options: {
	port?: number;
	host?: string;
	realtime?: Parameters<typeof startProjectRealtime>[1];
} = {}) {
	const health = app.locals.health as HealthState;
	const server = createServer(app);
	await verifyDatabase();
	const realtime = await startProjectRealtime(server, options.realtime);
	health.shuttingDown = false;
	health.realtimeReady = realtime.isReady;
	try {
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(options.port ?? runtimeConfig.port, options.host ?? '0.0.0.0', () => {
				server.off('error', reject);
				resolve();
			});
		});
	} catch (error) {
		health.shuttingDown = true;
		await realtime.close();
		throw error;
	}
	let closing: Promise<void> | undefined;
	return {
		server,
		close(): Promise<void> {
			if (!closing) {
				health.shuttingDown = true;
				closing = (async () => {
					const drained = new Promise<void>(resolve => server.close(() => resolve()));
					await realtime.close();
					await drained;
				})();
			}
			return closing;
		},
	};
}
