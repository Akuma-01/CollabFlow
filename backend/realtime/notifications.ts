import { PoolClient } from 'pg';

export const PROJECT_CHANNEL = 'collabflow_project_changes';
export const SESSION_CHANNEL = 'collabflow_session_revocations';

// Use the mutation's transaction: PostgreSQL delivers only after COMMIT and
// folds identical payloads within that transaction into one invalidation.
export async function notifyProject(client: PoolClient, projectId: number): Promise<void> {
	await client.query('SELECT pg_notify($1, $2)', [PROJECT_CHANNEL, String(projectId)]);
}
