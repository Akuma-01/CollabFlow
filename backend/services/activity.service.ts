import { PoolClient } from 'pg';
import pool from '../config/db';
import { ActivityQuery } from '../schemas/activity.schema';
import { AppError } from '../utils/AppError';

type ProjectActivity = {
	projectId: number;
	actorId: number;
} & (
	{ action: 'PROJECT_CREATED'; metadata: { title: string } } |
	{ action: 'PROJECT_UPDATED'; metadata: { from: { title: string }; to: { title: string } } }
);

// Require the mutation's transaction client. Actor identity and metadata are
// supplied by services; callers cannot create activity through the HTTP API.
export async function log(client: PoolClient, event: ProjectActivity): Promise<void> {
	const result = await client.query(
		`INSERT INTO activity_logs (project_id, actor_id, actor_name, action, entity_type, entity_id, metadata)
		 SELECT $1, u.id, u.name, $3, 'project', $1, $4::jsonb FROM users u WHERE u.id = $2`,
		[event.projectId, event.actorId, event.action, JSON.stringify(event.metadata)]
	);
	if (result.rowCount !== 1) throw new AppError('Activity actor no longer exists', 401);
}

export async function list(projectId: number, userId: number, query: ActivityQuery) {
	const { rows } = await pool.query(
		`SELECT a.id, a.project_id, a.actor_id, a.actor_name, a.action,
		        a.entity_type, a.entity_id, a.metadata, a.created_at
		 FROM activity_logs a
		 WHERE a.project_id = $1
		   AND EXISTS (
		     SELECT 1 FROM projects p WHERE p.id = a.project_id AND
		       (p.owner_id = $2 OR EXISTS (
		         SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
		       ))
		   )
		   AND ($3::bigint IS NULL OR a.id < $3)
		   AND ($4::text IS NULL OR a.action = $4)
		 ORDER BY a.id DESC LIMIT $5`,
		[projectId, userId, query.before ?? null, query.action ?? null, query.limit + 1]
	);
	const data = rows.slice(0, query.limit);
	// BIGSERIAL IDs stay strings throughout the API to avoid JS integer rounding.
	return { data, nextCursor: rows.length > query.limit ? data[data.length - 1].id as string : null };
}
