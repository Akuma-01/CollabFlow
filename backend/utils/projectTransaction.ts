import { PoolClient } from 'pg';
import { Project, ProjectRole } from '../types';
import { AppError } from './AppError';
import { withTransaction } from './transaction';

export function withProjectTransaction<T>(
	projectId: number,
	actorId: number,
	allowedRoles: readonly ProjectRole[],
	work: (client: PoolClient, project: Project) => Promise<T>,
): Promise<T> {
	return withTransaction(async client => {
		// All mutations in a project acquire this lock first. Read permissions in
		// a separate statement afterward so a queued request sees committed role changes.
		const { rows } = await client.query<Project>('SELECT * FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
		const project = rows[0];
		if (!project) throw new AppError('Project not found', 404);
		if (project.owner_id !== actorId) {
			const access = await client.query<{ role: ProjectRole }>(
				'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, actorId]
			);
			if (!access.rows[0] || !allowedRoles.includes(access.rows[0].role)) {
				throw new AppError('Insufficient role', 403);
			}
		}
		return work(client, project);
	});
}
