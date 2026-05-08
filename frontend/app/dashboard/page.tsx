"use client"

import { api, ApiError } from "@/lib/api";
import { Project } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const roleStyle: Record<string, string> = {
	owner: "bg-blue-50 text-blue-700",
	editor: "bg-green-50 text-green-700",
	viewer: "bg-gray-100 text-gray-600",
	guide: "bg-purple-50 text-purple-700",
};

export default function DashboardPage() {
	const router = useRouter();

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [projects, setProjects] = useState<Project[]>([]);
	const [showForm, setShowForm] = useState(false);
	const [projectTitle, setProjectTitle] = useState("");
	const [projectAdding, setProjectAdding] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		api
			.get<{ data: Project[] }>("/dashboard")
			.then((res) => setProjects(res.data))
			.catch((err) => {
				if (err instanceof ApiError && err.status === 401) {
					router.replace("/login");
				} else {
					setError(err instanceof Error ? err.message : "Failed to load dashboard");
				}
			})
			.finally(() => setLoading(false));
	}, [router]);

	useEffect(() => {
		if (showForm) inputRef.current?.focus();
	}, [showForm]);

	const handleCreateProject = async (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		setFormError("");
		setProjectAdding(true);

		try {
			const res = await api.post<{ data: Project }>("/projects", { title: projectTitle });

			setProjects(prev => [
				{
					...res.data,
					member_count: 1,
					task_count: 0,
					todo_count: 0,
					in_progress_count: 0,
					done_count: 0,
					my_role: "owner"
				},
				...prev
			]);

			setProjectTitle("");
			setShowForm(false);

		} catch (err) {
			setError(err instanceof Error ? err.message : "Project creation failed");
		} finally {
			setProjectAdding(false);
		}
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<div className="text-center space-y-3">
					<div className="mx-auto w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
					<p className="text-sm text-gray-500">Loading projects…</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<div className="text-center space-y-3">
					<p className="text-gray-700 font-medium">Something went wrong</p>
					<p className="text-sm text-gray-500">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-6xl px-6 py-8">
			{/* Header */}
			<div className="flex items-start justify-between mb-8">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Projects</h1>
					<p className="text-sm text-gray-500 mt-0.5">
						{projects.length === 0
							? "No projects yet"
							: `${projects.length} project${projects.length !== 1 ? "s" : ""}`}
					</p>
				</div>

				<button
					onClick={() => { setShowForm((v) => !v); setFormError(null); }}
					className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
				>
					<span className="text-lg leading-none">+</span>
					New project
				</button>
			</div>

			{/* Inline create form */}
			{showForm && (
				<div className="mb-8 bg-white rounded-xl border border-blue-200 shadow-sm p-5 max-w-md">
					<h2 className="text-sm font-semibold text-gray-700 mb-3">Create a new project</h2>
					{formError && (
						<p className="text-xs text-red-600 mb-3">{formError}</p>
					)}
					<form onSubmit={handleCreateProject} className="flex gap-2">
						<input
							ref={inputRef}
							required
							type="text"
							value={projectTitle}
							onChange={(e) => setProjectTitle(e.target.value)}
							placeholder="Project name…"
							className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
						/>
						<button
							type="submit"
							disabled={projectAdding}
							className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition"
						>
							{projectAdding ? "Creating…" : "Create"}
						</button>
						<button
							type="button"
							onClick={() => { setShowForm(false); setProjectTitle(""); setFormError(null); }}
							className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition"
						>
							Cancel
						</button>
					</form>
				</div>
			)}

			{/* Projects grid */}
			{projects.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-24 text-center">
					<div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-2xl mb-4">
						📋
					</div>
					<h2 className="text-gray-900 font-semibold mb-1">No projects yet</h2>
					<p className="text-sm text-gray-500 mb-6">Create your first project to start collaborating.</p>
					<button
						onClick={() => setShowForm(true)}
						className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
					>
						Create a project
					</button>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{projects.map((p) => (
						<Link
							key={p.id}
							href={`/projects/${p.id}`}
							className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
						>
							{/* Title row */}
							<div className="flex items-start justify-between gap-3 mb-4">
								<div className="min-w-0">
									<h2 className="truncate font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
										{p.title}
									</h2>
									<p className="text-xs text-gray-500 mt-0.5">
										{p.member_count} member{p.member_count !== 1 ? "s" : ""}
									</p>
								</div>
								<span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${roleStyle[p.my_role ?? "owner"]}`}>
									{p.my_role ?? "owner"}
								</span>
							</div>

							{/* Task stats */}
							<div className="grid grid-cols-3 gap-2 mb-4">
								<div className="rounded-lg bg-gray-50 px-3 py-2.5">
									<p className="text-[11px] text-gray-500 mb-0.5">Todo</p>
									<p className="text-base font-semibold text-gray-900">{p.todo_count}</p>
								</div>
								<div className="rounded-lg bg-amber-50 px-3 py-2.5">
									<p className="text-[11px] text-amber-700 mb-0.5">Active</p>
									<p className="text-base font-semibold text-amber-800">{p.in_progress_count}</p>
								</div>
								<div className="rounded-lg bg-green-50 px-3 py-2.5">
									<p className="text-[11px] text-green-700 mb-0.5">Done</p>
									<p className="text-base font-semibold text-green-800">{p.done_count}</p>
								</div>
							</div>

							{/* Footer */}
							<div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
								<span className="text-sm text-blue-600 font-medium group-hover:underline">
									Open project
								</span>
								<span className="text-blue-400 transition-transform group-hover:translate-x-1">→</span>
							</div>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
