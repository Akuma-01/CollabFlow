export interface User {
	id: number;
	name: string;
	email: string;
	password?: string;
}

export interface Project {
	id: number;
	title: string;
	owner_id: number;
}

export interface ProjectMember {
	user_id: number;
	project_id: number;
	role: ProjectRole;
}

export interface Task {
	id: number;
	title: string;
	description?: string;
	project_id: number;
	created_by: number;
	assigned_to?: number;
	status: TaskStatus;
}

export type ProjectRole = "owner" | "editor" | "viewer";
export type TaskStatus = "todo" | "in_progress" | "done";

export interface AppError {
	status?: number;
	message: string;
	code?: string;
}

// Extend Express Request to include the decoded JWT user
declare global {
	namespace Express {
		interface Request {
			user: {
				id: number;
				email: string;
			};
		}
	}
}
