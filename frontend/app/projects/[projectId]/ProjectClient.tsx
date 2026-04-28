"use client"

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";


// ─── Types ────────────────────────────────────────────────────────────────────

type Project = {
	id: number;
	title: string;
	owner_id: number;
	member_count: number;
	task_count: number;
	todo_count: number;
	in_progress_count: number;
	done_count: number;
};

type TaskStatus = "todo" | "in_progress" | "done";

type Task = {
	id: number;
	title: string;
	description: string | null;
	project_id: number;
	assigned_to_name: string | null;
	status: TaskStatus;
	deadline: string | null;
};

type ProjectRole = "editor" | "viewer" | "guide";

type Member = {
	id: number;
	email: string;
	role: ProjectRole;
};

type TaskBody = {
	title: string;
	description: string | null;
	assigned_to: number | null;
	status: TaskStatus;
	deadline: string | null;
};

type MemberBody = {
	user_id: number;
	role: ProjectRole;
};

// ─── API Helpers ──────────────────────────────────────────────────────────────

const getAuthHeaders = (): HeadersInit => {
	const token = localStorage.getItem("token");
	if (!token) throw new Error("No token")

	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${token}`
	};
};

const apiFetch = (
	method: "GET" | "POST",
	url: string,
	body?: TaskBody | MemberBody
) =>
	fetch(url, {
		method,
		headers: getAuthHeaders(),
		...(body ? { body: JSON.stringify(body) } : {}),
	});



// ─── MemberPanel ──────────────────────────────────────────────────────────────

type MemberPanelProps = {
	members: Member[];
	isOwner: boolean;
	projectId: string;
	baseUrl: string;
	onMemberAdded: () => Promise<void>;
};

function MemberPanel({
	members,
	isOwner,
	projectId,
	baseUrl,
	onMemberAdded,
}: MemberPanelProps) {
	const [showForm, setShowForm] = useState(false);
	const [userId, setUserId] = useState<number | "">("")
	const [role, setRole] = useState<ProjectRole | "">("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const projectRoles: ProjectRole[] = ["editor", "viewer", "guide"];

	const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!userId || !role) return;

		setSubmitting(true);
		setError(null);

		try {
			const res = await apiFetch(
				"POST",
				`${baseUrl}/projects/${projectId}/members`,
				{ user_id: userId as number, role: role as ProjectRole }
			);

			if (!res.ok) throw new Error("Member addition failed");

			await onMemberAdded();
			setUserId("");
			setRole("");
			setShowForm(false);

		} catch (err) {
			setError(err instanceof Error ? err.message : "Member addition failed");
		} finally {
			setSubmitting(false);
		}
	}

	const handleCancel = () => {
		setShowForm(false);
		setError(null);
	}

	return (
		<div className="flex-1 bg-white shadow rounded-xl p-4">
			<h2 className="text-lg font-semibold mb-3">Members</h2>

			{error && <p className="text-red-500 text-sm mb-2">{error}</p>}

			{showForm && (
				<form
					onSubmit={handleSubmit}
					className="mb-3 border p-3 rounded bg-gray-50 flex flex-col gap-2"
				>
					<input
						required
						type="number"
						placeholder="User ID"
						value={userId}
						onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : "")}
					/>

					<select
						required
						value={role}
						onChange={(e) => setRole(e.target.value as ProjectRole | "")}
						className="border p-2 rounded"
					>
						<option value="" disabled>Select role</option>
						{projectRoles.map((r) => (
							<option key={r} value={r}>
								{r}
							</option>
						))}
					</select>

					<div className="flex gap-2">
						<button
							type="submit"
							disabled={submitting}
							className="bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50"
						>
							{submitting ? "Adding..." : "Add"}
						</button>

						<button
							type="button"
							onClick={handleCancel}
							className="text-gray-500"
						>
							Cancel
						</button>
					</div>

				</form>
			)}



			{/* Members */}
			<div className="space-y-2 mb-3">
				{members.length === 0 ? (
					<p className="text-sm text-gray-400">No members yet.</p>
				) : (
					<>
						{members.map((member) => (
							<div
								key={member.id}
								className="flex justify-between text-sm border-b pb-1"
							>
								<span>{member.email}</span>
								<span className="text-gray-500">{member.role}</span>
							</div>
						))}
					</>
				)}
			</div>

			{isOwner && (
				<button
					onClick={() => setShowForm(true)}
					className="bg-blue-500 text-white px-3 py-1 rounded">
					+ Add
				</button>
			)}
		</div>
	)
}

// ─── TaskPanel ────────────────────────────────────────────────────────────────

type TaskPanelProps = {
	tasks: Task[];
	members: Member[];
	canCreateTask: boolean;
	projectId: string;
	baseUrl: string;
	onTaskAdded: (task: Task) => void;
};

function TaskPanel({
	tasks,
	members,
	canCreateTask,
	projectId,
	baseUrl,
	onTaskAdded
}: TaskPanelProps) {
	const [showForm, setShowForm] = useState(false);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [status, setStatus] = useState<TaskStatus>("todo");
	const [assignedTo, setAssignedTo] = useState<number | "">("");
	const [deadline, setDeadline] = useState("");

	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		setSubmitting(true);

		try {
			const res = await apiFetch(
				"POST",
				`${baseUrl}/projects/${projectId}/tasks`,
				{
					title,
					description: description || null,
					assigned_to: assignedTo || null,
					status,
					deadline: deadline || null,
				}
			)

			if (!res.ok) throw new Error("Task creation failed");

			const data = await res.json();

			const enrichedTask: Task = {
				...data.data,
				assigned_to_name: assignedTo
					? (members.find((m) => m.id === assignedTo)?.email ?? null)
					: null,
			}

			onTaskAdded(enrichedTask);

			setTitle("");
			setDescription("");
			setStatus("todo")
			setAssignedTo("");
			setDeadline("");
			setShowForm(false);

		} catch (err) {

			setError(err instanceof Error ? err.message : "Task creation failed");
		} finally {
			setSubmitting(false);
		}
	}

	const handleCancel = () => {
		setShowForm(false);
		setError(null);
	}

	return (
		<div className="flex-1 bg-white shadow rounded-xl p-4">
			{/* Header */}
			<div className="flex justify-between items-center mb-3">
				<h2 className="text-lg font-semibold">Tasks</h2>

				{canCreateTask && (<button
					onClick={() => setShowForm(prev => !prev)}
					className="text-blue-500 text-sm"
				>
					+ Add
				</button>
				)}
			</div>

			{error && <p className="text-red-500 text-sm mb-2">{error}</p>}

			{showForm && (
				<form
					onSubmit={handleSubmit}
					className="mb-3 border p-3 rounded bg-gray-50 flex flex-col gap-2"
				>
					<input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Task title"
						className="border p-2 rounded"
						required
					/>
					<textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Description"
						className="border p-2 rounded"
					/>
					<select
						value={assignedTo}
						onChange={(e) =>
							setAssignedTo(e.target.value ? Number(e.target.value) : "")
						}
						className="border p-2 rounded"
					>
						<option value="">Unassigned</option>
						<>
							{members.map((m) => (
								<option key={m.id} value={m.id}>
									{m.email}
								</option>
							))}
						</>

					</select>
					<select
						value={status}
						onChange={(e) => setStatus(e.target.value as TaskStatus)}
						className="border p-2 rounded"
					>
						<option value="todo">Todo</option>
						<option value="in_progress">In Progress</option>
						<option value="done">Done</option>
					</select>
					<input
						type="date"
						value={deadline}
						onChange={(e) => setDeadline(e.target.value)}
						className="border p-2 rounded"
					/>

					<div className="flex gap-2">
						<button
							type="submit"
							disabled={submitting}
							className="bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50"
						>
							{submitting ? "Creating..." : "Create"}
						</button>

						<button
							type="button"
							onClick={handleCancel}
							className="text-gray-500"
						>
							Cancel
						</button>
					</div>

				</form>
			)}

			{/* Task list */}
			<div className="space-y-2">
				{tasks.length === 0 ? (
					<p className="text-sm text-gray-400">No tasks yet.</p>
				) : (
					<>
						{tasks.map((task) => (
							<div key={task.id} className="text-sm border-b pb-1 space-y-0.5">
								<div className="flex justify-between">
									<span className="font-medium">{task.title}</span>
									<span className="text-gray-500">{task.status}</span>
								</div>
								<div className="flex justify-between text-gray-400">
									<span>{task.assigned_to_name || "Unassigned"}</span>
									{task.deadline && <span>Due: {task.deadline}</span>}
								</div>
							</div>
						))}
					</>

				)}
			</div>
		</div>
	)

}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectClient({ projectId }: { projectId: string }) {
	const router = useRouter();
	const BASE_URL = process.env.NEXT_PUBLIC_API_URL!;

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [projectDetails, setProjectDetails] = useState<Project | null>(null);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [members, setMembers] = useState<Member[]>([]);

	const [currentUserId, setCurrentUserId] = useState<number | null>(null);

	useEffect(() => {
		const fetchData = async () => {
			const token = localStorage.getItem("token");
			if (!token) {
				router.replace("/login");
				return;
			}

			const rawId = localStorage.getItem("user_id");
			setCurrentUserId(rawId ? Number(rawId) : null);

			const base = `${BASE_URL}/projects/${projectId}`;

			try {
				const headers = getAuthHeaders();

				const [projectRes, membersRes, tasksRes] = await Promise.all([
					fetch(base, { headers }),
					fetch(`${base}/members`, { headers }),
					fetch(`${base}/tasks`, { headers })
				]);

				if (!projectRes.ok) throw new Error("Project fetch failed");
				if (!membersRes.ok) throw new Error("Members fetch failed");
				if (!tasksRes.ok) throw new Error("Tasks fetch failed");

				const [projectData, memberData, tasksData] = await Promise.all([
					projectRes.json(),
					membersRes.json(),
					tasksRes.json()
				]);

				setProjectDetails(projectData.data);
				setMembers(memberData.data);
				setTasks(tasksData.data);

			} catch (err) {
				setError(err instanceof Error ? err.message : "Something went wrong");
			} finally {
				setLoading(false);
			}
		};

		fetchData();
	}, [projectId]);

	if (loading) return <div>Loading...</div>;
	if (error) return <div>{error}</div>;
	if (!projectDetails) return <div>No project found</div>;


	const isOwner =
		currentUserId !== null &&
		projectDetails.owner_id === currentUserId;

	const canCreateTask =
		isOwner ||
		(currentUserId !== null &&
			members.find(m => m.id === currentUserId)?.role === "editor");

	const refetchMembers = async () => {
		const res = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
			headers: getAuthHeaders(),
		});
		if (!res.ok) return;
		const data = await res.json();
		setMembers(data.data);
	};

	return (
		<div className="flex gap-6 p-6">

			{/* Project Summary */}
			<div className="flex-1 bg-white shadow rounded-xl p-4">
				<h2 className="text-lg font-semibold mb-3">Project</h2>
				<div className="space-y-1">
					<div className="font-medium">{projectDetails.title}</div>
					<div className="text-sm text-gray-600">
						Todo: {projectDetails.todo_count}
					</div>
					<div className="text-sm text-gray-600">
						In progress: {projectDetails.in_progress_count}
					</div>
					<div className="text-sm text-gray-600">
						Done: {projectDetails.done_count}
					</div>
				</div>
			</div>

			{/* Members */}
			<MemberPanel
				members={members}
				isOwner={isOwner}
				projectId={projectId}
				baseUrl={BASE_URL}
				onMemberAdded={refetchMembers}
			/>

			{/* Tasks */}
			<TaskPanel
				tasks={tasks}
				members={members}
				canCreateTask={!!canCreateTask}
				projectId={projectId}
				baseUrl={BASE_URL}
				onTaskAdded={(task) => setTasks((prev) => [...prev, task])}
			/>
		</div>
	);
}
