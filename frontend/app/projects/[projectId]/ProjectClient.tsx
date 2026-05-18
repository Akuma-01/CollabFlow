"use client"

import { api, ApiError } from "@/lib/api";
import { Member, Project, Task, TaskStatus } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Helpers ──────────────────────────────────────────────────────────────

const ROLE_PILL: Record<string, string> = {
	owner: "bg-blue-50 text-blue-700",
	editor: "bg-green-50 text-green-700",
	viewer: "bg-gray-100 text-gray-600",
	guide: "bg-purple-50 text-purple-700",
};

const STATUS_COL = {
	todo: { label: "Todo", bg: "bg-gray-50", dot: "bg-gray-400", count: "text-gray-500" },
	in_progress: { label: "In Progress", bg: "bg-amber-50", dot: "bg-amber-400", count: "text-amber-600" },
	done: { label: "Done", bg: "bg-green-50", dot: "bg-green-500", count: "text-green-600" },
} satisfies Record<TaskStatus, { label: string; bg: string; dot: string; count: string }>;

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

function fmtDate(d: string) {
	return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function isOverdue(deadline: string | null, status: TaskStatus) {
	if (!deadline || status === "done") return false;
	return new Date(deadline) < new Date(new Date().toDateString());
}

// ─── MemberPanel ──────────────────────────────────────────────────────────────

function MemberPanel({
	members,
	isOwner,
	projectId,
	onMembersChanged,
}: {
	members: Member[];
	isOwner: boolean;
	projectId: string;
	onMembersChanged: () => Promise<void>;
}) {
	const [showForm, setShowForm] = useState(false);
	const [role, setRole] = useState<"editor" | "viewer" | "guide" | "">("");

	const [search, setSearch] = useState('');
	const [results, setResults] = useState<{ id: number; name: string; email: string }[]>([]);
	const [selected, setSelected] = useState<{ id: number; name: string; email: string } | null>(null);
	const [searching, setSearching] = useState(false);

	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => { if (showForm) inputRef.current?.focus(); }, [showForm]);

	useEffect(() => {
		if (search.length < 2) { setResults([]); return; }
		const t = setTimeout(async () => {
			setSearching(true);
			try {
				const res = await api.get<{ data: typeof results }>(`/users/search?q=${encodeURIComponent(search)}`);
				setResults(res.data);
			} catch { setResults([]); }
			finally { setSearching(false); }
		}, 300);
		return () => clearTimeout(t);
	}, [search]);

	const handleAdd = async (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!selected || !role) return;

		setSubmitting(true);
		setError(null);

		try {
			await api.post(`/projects/${projectId}/members`, { user_id: selected.id, role });

			await onMembersChanged();
			setRole("");
			setSearch("");
			setResults([]);
			setSelected(null);
			setShowForm(false);

		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Failed to add member");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<aside className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-fit">
			{/* Header */}
			<div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
				<div>
					<h2 className="font-semibold text-gray-900 text-sm">Team</h2>
					<p className="text-xs text-gray-400 mt-0.5">{members.length} member{members.length !== 1 ? "s" : ""}</p>
				</div>
				{isOwner && !showForm && (
					<button
						onClick={() => setShowForm(true)}
						className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition"
					>
						+ Add
					</button>
				)}
			</div>

			{showForm && (
				<div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
					{error && <p className="text-xs text-red-600 mb-2">{error}</p>}
					<form onSubmit={handleAdd} className="space-y-2">
						<input
							ref={inputRef}
							type="text"
							placeholder="Search by name or email…"
							value={search}
							onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
							className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
						{selected && (
							<p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-2.5 py-1.5">
								✓ {selected.name} <span className="text-green-500">({selected.email})</span>
							</p>
						)}
						{results.length > 0 && !selected && (
							<ul className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100 text-sm max-h-40 overflow-y-auto">
								{results.map(u => (
									<li
										key={u.id}
										onClick={() => { setSelected(u); setSearch(u.email); setResults([]); }}
										className="px-3 py-2 cursor-pointer hover:bg-blue-50"
									>
										<span className="font-medium">{u.name}</span>
										<span className="text-gray-400 ml-2 text-xs">{u.email}</span>
									</li>
								))}
							</ul>
						)}
						{searching && <p className="text-xs text-gray-400">Searching…</p>}
						<select
							required
							value={role}
							onChange={(e) => setRole(e.target.value as typeof role)}
							className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						>
							<option value="" disabled>Select role</option>
							<option value="editor">Editor</option>
							<option value="viewer">Viewer</option>
							<option value="guide">Guide</option>
						</select>
						<div className="flex gap-2 pt-1">
							<button
								type="submit"
								disabled={submitting}
								className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition"
							>
								{submitting ? "Adding…" : "Add member"}
							</button>
							<button
								type="button"
								onClick={() => { setShowForm(false); setError(null); setRole(""); setSearch(""); setSelected(null); setResults([]); }}
								className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition"
							>
								Cancel
							</button>
						</div>
					</form>
				</div>
			)}

			{/* Member list */}
			<div className="divide-y divide-gray-50">
				{members.length === 0 ? (
					<p className="text-xs text-gray-400 px-5 py-6 text-center">No members yet.</p>
				) : (
					members.map((m) => (
						<div key={m.id} className="flex items-center justify-between px-5 py-3 gap-3">
							<div className="min-w-0">
								<p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
								<p className="text-xs text-gray-400 truncate">{m.email}</p>
							</div>
							<span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${ROLE_PILL[m.role]}`}>
								{m.role}
							</span>
						</div>
					))
				)}
			</div>
		</aside>
	)
}

// ─── TaskPanel ────────────────────────────────────────────────────────────────
function TaskCard({
	task,
	members,
	canEdit,
	projectId,
	onUpdate,
}: {
	task: Task;
	members: Member[];
	canEdit: boolean;
	projectId: string;
	onUpdate: (t: Task) => void;
}) {
	const [editingAssignee, setEditingAssignee] = useState(false);
	const [assignError, setAssignError] = useState<string | null>(null);
	const overdue = isOverdue(task.deadline, task.status);

	const handleAssign = async (userId: number | null) => {
		try {
			const res = await api.patch<{ data: Task }>(
				`/projects/${projectId}/tasks/${task.id}/assign`,
				{ assigned_to: userId }
			);
			const assignedMember = userId ? members.find((m) => m.id === userId) : null;
			onUpdate({
				...task,
				...res.data,
				assigned_to: userId,
				assigned_to_name: assignedMember?.name ?? null,
				assigned_to_email: assignedMember?.email ?? null,
			});
		} catch (err) {
			setAssignError(err instanceof ApiError ? err.message : "Failed to assign");
		} finally {
			setEditingAssignee(false);
		}
	};

	return (
		<div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 space-y-2.5 cursor-grab active:cursor-grabbing">
			<p className="text-sm font-medium text-gray-900 leading-snug">{task.title}</p>

			{task.description && (
				<p className="text-xs text-gray-500 line-clamp-2">{task.description}</p>
			)}

			{/* Assignee */}
			{editingAssignee && canEdit ? (
				<select
					autoFocus
					value={task.assigned_to ?? ""}
					onChange={async (e) => {
						const v = e.target.value;
						await handleAssign(v ? Number(v) : null);
					}}
					onBlur={() => setEditingAssignee(false)}
					className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
				>
					<option value="">Unassigned</option>
					{members.filter((m) => m.role !== "guide").map((m) => (
						<option key={m.id} value={m.id}>
							{m.name} ({m.role})
						</option>
					))}
				</select>
			) : (
				<button
					type="button"
					onClick={() => canEdit && setEditingAssignee(true)}
					className={`flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 transition w-full text-left truncate ${task.assigned_to
						? "bg-blue-50 text-blue-700 hover:bg-blue-100"
						: "bg-gray-100 text-gray-500 hover:bg-gray-200"
						} ${!canEdit ? "cursor-default" : ""}`}
				>
					<span className="text-[10px]">👤</span>
					<span className="truncate">{task.assigned_to_name ?? task.assigned_to_email ?? "Unassigned"}</span>
				</button>
			)}

			{/* Assign error */}
			{assignError && (
				<p className="text-[11px] text-red-500 mt-1">{assignError}</p>
			)}

			{/* Deadline */}
			{task.deadline && (
				<div className={`flex items-center gap-1 text-[11px] font-medium ${overdue ? "text-red-600" : "text-gray-400"}`}>
					<span>{overdue ? "⚠" : "🗓"}</span>
					<span>{overdue ? "Overdue · " : "Due "}{fmtDate(task.deadline)}</span>
				</div>
			)}
		</div>
	);
}

// ─── KanbanBoard ──────────────────────────────────────────────────────────────

function KanbanBoard({
	tasks,
	members,
	canEdit,
	canCreate,
	projectId,
	onTasksChanged,
}: {
	tasks: Task[];
	members: Member[];
	canEdit: boolean;
	canCreate: boolean;
	projectId: string;
	onTasksChanged: (updater: (prev: Task[]) => Task[]) => void;
}) {
	const [dragged, setDragged] = useState<Task | null>(null);
	const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
	const [showForm, setShowForm] = useState(false);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [assignedTo, setAssignedTo] = useState<number | "">("");
	const [deadline, setDeadline] = useState("");
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const titleRef = useRef<HTMLInputElement>(null);

	useEffect(() => { if (showForm) titleRef.current?.focus(); }, [showForm]);

	const grouped = STATUS_ORDER.reduce((acc, s) => {
		acc[s] = tasks.filter((t) => t.status === s);
		return acc;
	}, {} as Record<TaskStatus, Task[]>);

	const upsert = (task: Task) =>
		onTasksChanged((prev) => {
			const exists = prev.some((t) => t.id === task.id);
			return exists ? prev.map((t) => (t.id === task.id ? task : t)) : [...prev, task];
		});

	const handleDrop = async (newStatus: TaskStatus) => {
		if (!dragged || dragged.status === newStatus) { setDragged(null); setDragOver(null); return; }
		const prev = dragged;
		upsert({ ...dragged, status: newStatus }); // optimistic
		setDragged(null); setDragOver(null);
		try {
			const res = await api.patch<{ data: Task }>(
				`/projects/${projectId}/tasks/${prev.id}/status`,
				{ status: newStatus }
			);
			upsert({ ...prev, ...res.data });
		} catch {
			upsert(prev); // rollback
		}
	};

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		setCreateError(null);
		setCreating(true);
		try {
			const res = await api.post<{ data: Task }>(`/projects/${projectId}/tasks`, {
				title,
				description: description || undefined,
				assigned_to: assignedTo || null,
				deadline: deadline || undefined,
			});
			const m = assignedTo ? members.find((m) => m.id === assignedTo) : null;
			upsert({
				...res.data,
				assigned_to: assignedTo || null,
				assigned_to_name: m?.name ?? null,
				assigned_to_email: m?.email ?? null,
			});
			setTitle(""); setDescription(""); setAssignedTo(""); setDeadline("");
			setShowForm(false);
		} catch (err) {
			setCreateError(err instanceof ApiError ? err.message : "Failed to create task");
		} finally {
			setCreating(false);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Toolbar */}
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-gray-900 text-sm">Board</h2>
				{canCreate && (
					<button
						onClick={() => { setShowForm((v) => !v); setCreateError(null); }}
						className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition"
					>
						+ Add task
					</button>
				)}
			</div>

			{/* Create task form */}
			{showForm && (
				<div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5">
					<h3 className="text-sm font-semibold text-gray-800 mb-4">New task</h3>
					{createError && <p className="text-xs text-red-600 mb-3">{createError}</p>}
					<form onSubmit={handleCreate} className="space-y-3">
						<input
							ref={titleRef}
							required
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Task title…"
							className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
						<textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Description (optional)"
							rows={2}
							className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
						<div className="grid grid-cols-2 gap-3">
							<select
								value={assignedTo}
								onChange={(e) => setAssignedTo(e.target.value ? Number(e.target.value) : "")}
								className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
							>
								<option value="">Unassigned</option>
								{members.filter((m) => m.role !== "guide").map((m) => (
									<option key={m.id} value={m.id}>{m.name}</option>
								))}
							</select>
							<input
								type="date"
								value={deadline}
								onChange={(e) => setDeadline(e.target.value)}
								className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>
						<div className="flex gap-2 pt-1">
							<button
								type="submit"
								disabled={creating}
								className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition"
							>
								{creating ? "Creating…" : "Create task"}
							</button>
							<button
								type="button"
								onClick={() => { setShowForm(false); setCreateError(null); }}
								className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition"
							>
								Cancel
							</button>
						</div>
					</form>
				</div>
			)}

			{/* Columns */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				{STATUS_ORDER.map((statusKey) => {
					const meta = STATUS_COL[statusKey];
					const col = grouped[statusKey];
					const isTargeted = dragOver === statusKey;
					return (
						<div
							key={statusKey}
							className={`rounded-xl p-3 min-h-[220px] transition-colors ${meta.bg} ${isTargeted ? "ring-2 ring-blue-400 ring-inset" : ""}`}
							onDragOver={(e) => { e.preventDefault(); setDragOver(statusKey); }}
							onDragLeave={() => setDragOver(null)}
							onDrop={() => handleDrop(statusKey)}
						>
							{/* Column header */}
							<div className="flex items-center gap-2 mb-3 px-1">
								<span className={`w-2 h-2 rounded-full ${meta.dot}`} />
								<span className="text-xs font-semibold text-gray-700">{meta.label}</span>
								<span className={`ml-auto text-xs font-medium ${meta.count}`}>{col.length}</span>
							</div>

							{/* Cards */}
							<div className="space-y-2">
								{col.length === 0 ? (
									<p className="text-xs text-gray-400 text-center py-6">Drop tasks here</p>
								) : (
									col.map((task) => (
										<div
											key={task.id}
											draggable={canEdit}
											onDragStart={() => setDragged(task)}
											onDragEnd={() => { if (dragged) setDragged(null); }}
										>
											<TaskCard
												task={task}
												members={members}
												canEdit={canEdit}
												projectId={projectId}
												onUpdate={upsert}
											/>
										</div>
									))
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ProjectClient({ projectId }: { projectId: string }) {
	const router = useRouter();

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [project, setProject] = useState<Project | null>(null);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [members, setMembers] = useState<Member[]>([]);
	const [currentUserId, setCurrentUserId] = useState<number | null>(null);

	useEffect(() => {
		const load = async () => {
			try {
				const [meRes, projectRes, membersRes, tasksRes] = await Promise.all([
					api.get<{ data: { id: number; name: string; email: string } }>("/auth/me"),
					api.get<{ data: Project }>(`/projects/${projectId}`),
					api.get<{ data: Member[] }>(`/projects/${projectId}/members`),
					api.get<{ data: Task[] }>(`/projects/${projectId}/tasks`),
				]);
				setCurrentUserId(meRes.data.id);
				setProject(projectRes.data);
				setMembers(membersRes.data);
				setTasks(tasksRes.data);
			} catch (err) {
				if (err instanceof ApiError && err.status === 401) {
					router.replace("/login");
				} else {
					setError(err instanceof Error ? err.message : "Failed to load project");
				}
			} finally {
				setLoading(false);
			}
		};
		load();
	}, [projectId, router]);

	const refetchMembers = async () => {
		const res = await api.get<{ data: Member[] }>(`/projects/${projectId}/members`);
		setMembers(res.data);
	};

	const handleDeleteProject = async () => {
		if (!window.confirm("Permanently delete this project and all its tasks?")) return;
		try {
			await api.delete(`/projects/${projectId}`);
			router.replace("/dashboard");
		} catch {
			setError("Failed to delete project");
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<div className="text-center space-y-3">
					<div className="mx-auto w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
					<p className="text-sm text-gray-500">Loading project…</p>
				</div>
			</div>
		);
	}

	if (error || !project) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<div className="text-center space-y-3">
					<p className="text-gray-700 font-medium">{error ?? "Project not found"}</p>
					<Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
						← Back to Dashboard
					</Link>
				</div>
			</div>
		);
	}

	const isOwner = currentUserId !== null && project.owner_id === currentUserId;
	const myRole = members.find((m) => m.id === currentUserId)?.role;
	const canEdit = isOwner || myRole === "editor";
	const canCreate = canEdit;

	const total = project.task_count;
	const doneCount = project.done_count;
	const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

	return (
		<div className="mx-auto max-w-7xl px-6 py-6 space-y-6">
			{/* Breadcrumb */}
			<Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
				<span>←</span>
				<span>Dashboard</span>
			</Link>

			{/* Project header */}
			<div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5">
				<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
					<div className="min-w-0 flex-1">
						<h1 className="text-xl font-bold text-gray-900 truncate">{project.title}</h1>

						{/* Status badges */}
						<div className="flex flex-wrap gap-2 mt-3">
							<span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
								<span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
								{project.todo_count} Todo
							</span>
							<span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
								<span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
								{project.in_progress_count} In Progress
							</span>
							<span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-medium">
								<span className="w-1.5 h-1.5 rounded-full bg-green-500" />
								{project.done_count} Done
							</span>
							<span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
								<span>👥</span>
								{project.member_count} Member{project.member_count !== 1 ? "s" : ""}
							</span>
						</div>

						{/* Progress bar */}
						{total > 0 && (
							<div className="mt-4 flex items-center gap-3">
								<div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
									<div
										className="h-full bg-green-500 rounded-full transition-all"
										style={{ width: `${progress}%` }}
									/>
								</div>
								<span className="text-xs text-gray-500 tabular-nums shrink-0">{progress}% done</span>
							</div>
						)}
					</div>

					{isOwner && (
						<button
							onClick={handleDeleteProject}
							className="shrink-0 px-3.5 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition"
						>
							Delete project
						</button>
					)}
				</div>
			</div>

			{/* Body */}
			<div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
				<MemberPanel
					members={members}
					isOwner={isOwner}
					projectId={projectId}
					onMembersChanged={refetchMembers}
				/>
				<KanbanBoard
					tasks={tasks}
					members={members}
					canEdit={canEdit}
					canCreate={canCreate}
					projectId={projectId}
					onTasksChanged={setTasks}
				/>
			</div>
		</div>
	);
}
