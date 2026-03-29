const pool = require("../config/db")
const { isUserMember, isProjectOwner } = require("./projects.service");

const createTask = async (title, description, project_id, created_by) => {
	const result = await pool.query("INSERT INTO tasks (title, description, project_id, created_by) VALUES ($1, $2, $3, $4) RETURNING *", [title, description, project_id, created_by])

	return result.rows[0];
}

const getProjectTasks = async (project_id, assigned_to, status) => {
	const result = await pool.query(`SELECT 
		t.id, 
		t.title, 
		t.description, 
		t.project_id, 
		u.name AS assigned_to_name, 
		status 
		FROM tasks t 
		LEFT JOIN users u ON t.assigned_to = u.id 
		WHERE t.project_id = $1 
		AND ($2::int IS NULL OR t.assigned_to = $2)
		AND ($3::text IS NULL OR t.status = $3)
	`, [project_id, assigned_to, status])

	return result.rows;
}

const assignTask = async (task_id, project_id, assigned_to) => {
	const task = await pool.query("SELECT * FROM tasks WHERE id = $1", [task_id]);

	if (task.rows.length === 0) {
		throw { status: 404, message: "Task not found" };
	}

	if (task.rows[0].project_id !== project_id) {
		throw { status: 403, message: "Task does not belong to this project" };
	}

	const taskData = task.rows[0];

	if (await isProjectOwner(taskData.project_id, assigned_to) || await isUserMember(taskData.project_id, assigned_to)) {
		const updateResult = await pool.query("UPDATE tasks SET assigned_to = $1 WHERE id = $2 RETURNING *", [assigned_to, task_id]);

		return updateResult.rows[0];
	} else {
		throw { status: 403, message: "User is not a member of this project" };
	}
}

const updateTaskStatus = async (task_id, status) => {
	const result = await pool.query("UPDATE tasks SET status=$1 WHERE id=$2 RETURNING *", [status, task_id]);

	return result.rows[0];
}

module.exports = {
	createTask,
	getProjectTasks,
	assignTask,
	updateTaskStatus,
}
