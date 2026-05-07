export type TaskStatus = "todo" | "in_progress" | "done";
export type ProjectRole = "owner" | "editor" | "viewer" | "guide";

export interface User {
	id: number;
	name: string;
	email: string;
}

export interface Project {
	id: number;
	title: string;
	owner_id: number;
	my_role: ProjectRole | null;
	member_count: number;
	task_count: number;
	todo_count: number;
	in_progress_count: number;
	done_count: number;
}

export interface Task {
	id: number;
	title: string;
	description: string | null;
	project_id: number;
	assigned_to: number | null;
	assigned_to_name: string | null;
	assigned_to_email: string | null;
	status: TaskStatus;
	deadline: string | null;
}

export interface Member {
	id: number;
	name: string;
	email: string;
	role: ProjectRole;
}
