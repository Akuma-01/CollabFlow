const pool = require('../config/db');

const getProjectById = async (project_id) => {
	const result = await pool.query("SELECT * FROM projects WHERE id = $1", [project_id]);

	return result.rows[0];
}

const isProjectOwner = async (project_id, user_id) => {
	const project = await getProjectById(project_id);

	return project && project.owner_id === user_id;
}

const isUserMember = async (project_id, user_id) => {
	const result = await pool.query("SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2", [project_id, user_id]);

	return result.rows.length > 0;
}

const getProjectMember = async (project_id, user_id) => {
	const result = await pool.query("SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2", [project_id, user_id]);

	return result.rows[0];
}

const getAllProjects = async (userId) => {
	const result = await pool.query(
		"SELECT p.id, p.title, COUNT(DISTINCT pm.user_id) AS member_count, COUNT(DISTINCT t.id) AS task_count FROM projects p LEFT JOIN project_members pm ON pm.project_id = p.id LEFT JOIN tasks t ON t.project_id = p.id WHERE p.owner_id = $1 GROUP BY p.id, p.title ORDER BY p.id;", [userId]);

	return result.rows;
}

const getProjectDetails = async (project_id) => {
	const result = await pool.query("SELECT p.id, p.title, p.owner_id, COUNT(DISTINCT pm.user_id) AS member_count, COUNT(DISTINCT t.id) AS task_count, COUNT(DISTINCT CASE WHEN t.status = 'todo' THEN t.id END) AS todo_count, COUNT(DISTINCT CASE WHEN t.status = 'in_progress' THEN t.id END) AS in_progress_count, COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) AS done_count FROM projects p LEFT JOIN tasks t ON t.project_id = p.id LEFT JOIN project_members pm ON pm.project_id=p.id WHERE p.id = $1 GROUP BY p.id, p.title, p.owner_id", [project_id])

	return result.rows[0];
}

const createProject = async (title, owner_id) => {

	const result = await pool.query("INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING *;", [title, owner_id]);

	return result.rows[0];
}

const createProjectMember = async (data) => {
	const { project_id, user_id, role } = data;

	const result = await pool.query("INSERT INTO project_members (user_id, project_id, role) VALUES ($1, $2, $3) RETURNING *;", [user_id, project_id, role]);

	return result.rows[0];
}

const getProjectMembers = async (project_id) => {
	const result = await pool.query("SELECT u.id, u.email, pm.role FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id=$1", [project_id]);

	return result.rows;
}

const deleteProject = async (project_id) => {
	const result = await pool.query("DELETE FROM projects WHERE id =$1  RETURNING *", [project_id]);

	return result.rows[0];
}

module.exports = {
	getProjectById,
	isUserMember,
	isProjectOwner,
	getProjectMember,
	deleteProject,
	getAllProjects,
	createProject,
	createProjectMember,
	getProjectMembers,
	getProjectDetails
}
