import pool from '../config/db';
import { Project, ProjectMember, ProjectRole } from '../types';
import { AppError } from '../utils/AppError';

export const getProjectById = async (project_id: number): Promise<Project | undefined> => {
	const result = await pool.query('SELECT * FROM projects WHERE id = $1', [project_id]);
	return result.rows[0];
};

export const isProjectOwner = async (project_id: number, user_id: number): Promise<boolean> => {
	const result = await pool.query(
		'SELECT 1 FROM projects WHERE id = $1 AND owner_id = $2',
		[project_id, user_id]
	);
	return result.rows.length > 0;
};

export const getProjectAccess = async (
	project_id: number,
	user_id: number
): Promise<{ owner_id: number; role: ProjectRole | null } | undefined> => {
	const result = await pool.query(
		`SELECT p.owner_id, pm.role
		 FROM projects p
		 LEFT JOIN project_members pm
		   ON pm.project_id = p.id AND pm.user_id = $2
		 WHERE p.id = $1`,
		[project_id, user_id]
	);
	return result.rows[0];
};

export const getAllProjects = async (userId: number): Promise<Project[]> => {
	const result = await pool.query(
		`SELECT
			p.id,
			p.title,
			COUNT(DISTINCT pm.user_id) AS member_count,
			COUNT(DISTINCT t.id) AS task_count
		FROM projects p
		LEFT JOIN project_members pm ON pm.project_id = p.id
		LEFT JOIN tasks t ON t.project_id = p.id
		WHERE p.owner_id = $1
			OR EXISTS (
				SELECT 1 FROM project_members
				WHERE project_id = p.id AND user_id = $1
			)
		GROUP BY p.id, p.title
		ORDER BY p.id;`,
		[userId]
	);
	return result.rows;
};

export const getProjectDetails = async (project_id: number): Promise<Project | undefined> => {
	const result = await pool.query(
		`SELECT p.id, p.title, p.owner_id,
      (1 + COUNT(DISTINCT pm.user_id))::int AS member_count,
      COUNT(DISTINCT t.id)::int AS task_count,
      COUNT(DISTINCT CASE WHEN t.status = 'todo' THEN t.id END)::int AS todo_count,
      COUNT(DISTINCT CASE WHEN t.status = 'in_progress' THEN t.id END)::int AS in_progress_count,
      COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END)::int AS done_count
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    LEFT JOIN project_members pm ON pm.project_id = p.id
    WHERE p.id = $1
    GROUP BY p.id, p.title, p.owner_id`,
		[project_id]
	);
	return result.rows[0];
};

export const createProject = async (title: string, owner_id: number): Promise<Project> => {
	const result = await pool.query(
		'INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING *;',
		[title, owner_id]
	);
	return result.rows[0];
};

export const deleteProject = async (project_id: number): Promise<Project | undefined> => {
	const result = await pool.query(
		'DELETE FROM projects WHERE id = $1 RETURNING *',
		[project_id]
	);
	return result.rows[0];
};

export const updateProject = async (project_id: number, title: string): Promise<Project | undefined> => {
	const result = await pool.query(
		`UPDATE projects SET title = $1 WHERE id = $2 RETURNING *`,
		[title, project_id]
	);
	return result.rows[0];
};


// ── Members ──────────────────────────────────────────────────────────────────

export const createProjectMember = async (data: {
	project_id: number;
	user_id: number;
	role: ProjectRole;
}): Promise<ProjectMember> => {
	const { project_id, user_id, role } = data;

	if (await isProjectOwner(project_id, user_id)) {
		throw new AppError('Owner cannot be added as member', 400);
	}

	const result = await pool.query(
		'INSERT INTO project_members (user_id, project_id, role) VALUES ($1, $2, $3) RETURNING *;',
		[user_id, project_id, role]
	);
	return result.rows[0];
};

export const getProjectMembers = async (
	project_id: number
): Promise<Array<{ id: number; name: string; email: string; role: ProjectRole }>> => {
	const result = await pool.query(
		`SELECT * FROM (
			SELECT u.id, u.name, u.email, 'owner' AS role, 0 AS sort_order
			FROM projects p
			JOIN users u ON u.id = p.owner_id
			WHERE p.id = $1

			UNION ALL

			SELECT
				u.id, u.name, u.email, pm.role,
				CASE
					WHEN pm.role = 'editor' THEN 1
					WHEN pm.role = 'viewer' THEN 2
					WHEN pm.role = 'guide'  THEN 3
					ELSE 4
				END AS sort_order
			FROM project_members pm
			JOIN users u ON u.id = pm.user_id
			WHERE pm.project_id = $1
		) members
		ORDER BY sort_order, email;`,
		[project_id]
	);
	return result.rows;
};

export const isUserMember = async (project_id: number, user_id: number): Promise<boolean> => {
	const result = await pool.query(
		'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
		[project_id, user_id]
	);
	return result.rows.length > 0;
};

export const getProjectMember = async (project_id: number, user_id: number): Promise<ProjectMember | undefined> => {
	const result = await pool.query(
		'SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2',
		[project_id, user_id]
	);
	return result.rows[0];
};

export const removeMember = async (project_id: number, user_id: number): Promise<ProjectMember | undefined> => {
	if (await isProjectOwner(project_id, user_id)) {
		throw new AppError('Cannot modify owner', 403);
	}

	const result = await pool.query(
		'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2 RETURNING *',
		[project_id, user_id]
	);
	return result.rows[0];
};

export const updateMemberRole = async (project_id: number, user_id: number, role: ProjectRole): Promise<ProjectMember | undefined> => {
	if (await isProjectOwner(project_id, user_id)) {
		throw new AppError('Cannot modify owner', 403);
	}

	const result = await pool.query(
		'UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3 RETURNING *',
		[role, project_id, user_id]
	);
	return result.rows[0];
};


// ── Guide ─────────────────────────────────────────────────────────────────────

export const addGuide = async (project_id: number, user_id: number): Promise<void> => {
	const existing = await pool.query(
		'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
		[project_id, user_id]
	);
	if (existing.rows.length > 0) {
		throw new AppError('User is already a member of this project', 400);
	}

	await pool.query(
		'INSERT INTO project_members (user_id, project_id, role) VALUES ($1, $2, $3)',
		[user_id, project_id, 'guide']
	);
};

export const isGuide = async (project_id: number, user_id: number): Promise<boolean> => {
	const result = await pool.query(
		'SELECT 1 FROM project_members WHERE user_id = $1 AND project_id = $2 AND role = $3',
		[user_id, project_id, 'guide']
	);
	return result.rows.length > 0;
};

export const getUserDashboard = async (user_id: number) => {
	const result = await pool.query(
		`SELECT
			p.id, p.title, p.owner_id,
			pm_viewer.role AS my_role,
			(1 + COUNT(DISTINCT pm.user_id))::int AS member_count,
			COUNT(DISTINCT t.id) AS task_count,
			COUNT(DISTINCT CASE WHEN t.status = 'todo' THEN t.id END) AS todo_count,
			COUNT(DISTINCT CASE WHEN t.status = 'in_progress' THEN t.id END) AS in_progress_count,
			COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) AS done_count
		FROM projects p
		LEFT JOIN project_members pm ON pm.project_id = p.id
		LEFT JOIN project_members pm_viewer ON pm_viewer.project_id = p.id AND pm_viewer.user_id = $1
		LEFT JOIN tasks t ON t.project_id = p.id
		WHERE p.owner_id = $1
			OR EXISTS (
				SELECT 1 FROM project_members
				WHERE project_id = p.id AND user_id = $1
			)
		GROUP BY p.id, p.title, p.owner_id, pm_viewer.role
		ORDER BY p.id DESC`,
		[user_id]
	);
	return result.rows;
};
