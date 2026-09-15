import { Express } from 'express';
import pool from '../config/db';

export interface HealthState {
	shuttingDown: boolean;
	realtimeReady: () => boolean;
}

export function installHealthRoutes(app: Express): HealthState {
	const state: HealthState = { shuttingDown: false, realtimeReady: () => false };
	let probe: Promise<boolean> | undefined;
	const query = { text: 'SELECT 1', query_timeout: 2000 };
	app.get('/health/live', (_req, res) => {
		res.set('Cache-Control', 'no-store').json({ status: 'ok' });
	});
	app.get('/health/ready', async (_req, res) => {
		res.set('Cache-Control', 'no-store');
		let ready = false;
		if (!state.shuttingDown && state.realtimeReady()) {
			// Share concurrent probes so a health-check burst uses one pool slot.
			probe ??= pool.query(query)
				.then(() => true, () => false).finally(() => { probe = undefined; });
			ready = await probe;
		}
		ready = ready && !state.shuttingDown && state.realtimeReady();
		res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
	});
	return state;
}

export async function verifyDatabase(): Promise<void> {
	// Fail before accepting traffic if baseline tables or required migrations are
	// missing. LIMIT 0 resolves the schema and permissions without scanning data.
	await pool.query(`SELECT u.id, p.id, pm.user_id, t.id, s.refresh_token_hash,
		s.expires_at, s.revoked_at, a.actor_name, a.metadata
		FROM users u, projects p, project_members pm, tasks t, auth_sessions s, activity_logs a LIMIT 0`);
}
