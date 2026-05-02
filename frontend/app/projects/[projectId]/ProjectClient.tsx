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
	assigned_to: number | null;
	assigned_to_name: string | null;
	assigned_to_email: string | null;
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

type TaskStatusBody = {
	status: TaskStatus;
}

type AssignedToBody = {
	assigned_to: number | null,
}
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
	method: "GET" | "POST" | "PATCH",
	url: string,
	body?: TaskBody | MemberBody | TaskStatusBody | AssignedToBody,
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

	const [editingAssigneeTaskId, setEditingAssigneeTaskId] = useState<number | null>(null);

	// ─── Drag State ────────────────────────────────────────────
	const [draggedTask, setDraggedTask] = useState<Task | null>(null);

	const handleDragStart = (task: Task) => {
		setDraggedTask(task);
	};

	const handleDrop = async (newStatus: TaskStatus) => {
		if (!draggedTask || draggedTask.status === newStatus) return;

		try {
			const res = await apiFetch(
				"PATCH",
				`${baseUrl}/projects/${projectId}/tasks/${draggedTask.id}/status`,
				{ status: newStatus }
			);

			if (!res.ok) throw new Error("Status update failed");

			// update UI locally
			onTaskAdded({
				...draggedTask,
				status: newStatus
			});

		} catch (err) {
			setError("Failed to update status");
		} finally {
			setDraggedTask(null);
		}
	};

	const allowDrop = (e: React.DragEvent) => e.preventDefault();

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
				assigned_to: assignedTo || data.data.assigned_to || null,
				assigned_to_email: assignedTo
					? members.find((m) => m.id === assignedTo)?.email ?? null
					: data.data.assigned_to_email ?? null,
			};

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

	// ─── Kanban Setup ───────────────────────────────────────────
	const statusOrder: TaskStatus[] = ["todo", "in_progress", "done"];

	const statusMeta = {
		todo: { title: "Todo" },
		in_progress: { title: "In Progress" },
		done: { title: "Done" },
	};

	const grouped = statusOrder.reduce((acc, s) => {
		acc[s] = tasks.filter(t => t.status === s);
		return acc;
	}, {} as Record<TaskStatus, Task[]>);

	const handleAssign = async (task: Task, userId: number | null) => {
		try {
			const res = await apiFetch(
				"PATCH",
				`${baseUrl}/projects/${projectId}/tasks/${task.id}/assign`,
				{ assigned_to: userId }
			)
			if (!res.ok) throw new Error("Assign failed");

			const data = await res.json();

			const updatedTask: Task = {
				...task,
				...data.data,
				assigned_to: userId,
				assigned_to_email: userId
					? members.find((m) => m.id === userId)?.email ?? null
					: null,
			};

			onTaskAdded(updatedTask);
			setEditingAssigneeTaskId(null);
		} catch {
			setError("Failed to assign task")
		}


	}
	// ─── UI ─────────────────────────────────────────────────────
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

			{/* Form */}
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

					<div className="flex gap-3">
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
							className="text-gray-500 bg-red-100 px-3 py-1 rounded"
						>
							Cancel
						</button>
					</div>

				</form>
			)}

			{/* Kanban Board */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">

				{statusOrder.map((statusKey) => (
					<div
						key={statusKey}
						className="bg-gray-50 rounded-lg p-3"
						onDragOver={allowDrop}
						onDrop={() => handleDrop(statusKey)}
					>
						{/* Column Header */}
						<div className="flex justify-between items-center mb-3">
							<h3 className="text-sm font-semibold">
								{statusMeta[statusKey].title}
							</h3>
							<span className="text-xs text-gray-500">
								{grouped[statusKey].length}
							</span>
						</div>

						{/* Tasks */}
						<div className="space-y-2">
							{grouped[statusKey].length === 0 ? (
								<p className="text-xs text-gray-400">No tasks</p>
							) : (
								grouped[statusKey].map((task) => (
									<div
										key={task.id}
										draggable
										onDragStart={() => handleDragStart(task)}
										className="bg-white border rounded-lg p-3 shadow-sm text-sm cursor-move"
									>
										<div className="font-medium">{task.title}</div>

										<div className="flex justify-between items-center text-xs text-gray-500 gap-2">

											<div>
												{editingAssigneeTaskId === task.id ? (
													<select
														autoFocus
														value={task.assigned_to ?? ""}
														onChange={async (e) => {
															const userId = e.target.value
																? Number(e.target.value)
																: null;

															await handleAssign(task, userId);
														}}
														onBlur={() => setEditingAssigneeTaskId(null)}
														className="border rounded px-2 py-1 text-xs bg-white"
													>
														<option value="">Unassigned</option>
														{members.map((m) => (
															<option key={m.id} value={m.id}>
																{m.email}
															</option>
														))}
													</select>
												) : (
													<button
														type="button"
														onClick={() => setEditingAssigneeTaskId(task.id)}
														className={
															task.assigned_to
																? "px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100"
																: "px-2 py-1 rounded-full bg-gray-100 text-gray-500 border hover:bg-gray-200"
														}
													>
														{task.assigned_to_email ?? "Unassigned"}
													</button>
												)}
											</div>

											{/* Deadline */}
											{task.deadline && <span>{task.deadline}</span>}
										</div>
									</div>
								))
							)}
						</div>

					</div>
				))}

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

	// Drag component
	const upsertTask = (task: Task) => {
		setTasks(prev => {
			const exists = prev.find(t => t.id === task.id);
			if (exists) {
				return prev.map(t => t.id === task.id ? task : t);
			}
			return [...prev, task];
		});
	};

	const handleDeleteProject = async () => {
		const ok = window.confirm("Delete this project? This cannot be undone.");
		if (!ok) return;

		try {
			const res = await fetch(
				`${BASE_URL}/projects/${projectId}`,
				{
					method: "DELETE",
					headers: getAuthHeaders(),
				}
			)

			if (!res.ok) throw new Error("Delete failed");

			router.replace("/dashboard");

		} catch {
			setError("Failed to delete project")
		}
	}

	return (
		<div className="p-6 max-w-6xl mx-auto space-y-6">

			{/* Back Link */}
			<div>
				<button
					onClick={() => router.push("/dashboard")}
					className="text-blue-600 text-sm hover:underline"
				>
					← Back to Dashboard
				</button>
			</div>

			{/* Project Summary */}
			<div className="bg-white shadow rounded-2xl p-6 flex justify-between items-center">

				{/* Left Section */}
				<div className="space-y-3">
					{/* Title */}
					<h2 className="text-2xl font-semibold text-gray-800">
						{projectDetails.title}
					</h2>

					{/* Stats */}
					<div className="flex flex-wrap gap-2 text-sm">
						<span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
							📝 {projectDetails.todo_count} Todo
						</span>
						<span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 font-medium">
							⏳ {projectDetails.in_progress_count} In Progress
						</span>
						<span className="px-3 py-1 rounded-full bg-green-100 text-green-800 font-medium">
							✅ {projectDetails.done_count} Done
						</span>
						<span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">
							👥 {projectDetails.member_count} Members
						</span>

					</div>

				</div>

				{/* Right Section */}
				{isOwner && (
					<button
						onClick={handleDeleteProject}
						className="text-red-500 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 transition text-sm"
					>
						Delete
					</button>
				)}

			</div>


			{/* Members + Tasks Grid */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

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
					onTaskAdded={upsertTask}
				/>

			</div>

		</div>
	);
}
