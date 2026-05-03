"use client"

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Project = {
	id: number;
	title: string;
	owner_id: number;
	my_role: string | null;
	member_count: number;
	task_count: number;
	todo_count: number;
	in_progress_count: number;
	done_count: number;
};

export default function DashboardPage() {
	const router = useRouter();
	const BASE_URL = process.env.NEXT_PUBLIC_API_URL!;

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [projects, setProjects] = useState<Project[]>([]);
	const [showForm, setShowForm] = useState(false);
	const [projectTitle, setProjectTitle] = useState("");
	const [projectAdding, setProjectAdding] = useState(false);

	useEffect(() => {
		const fetchData = async () => {
			const token = localStorage.getItem("token");

			if (!token) {
				router.replace("/login");
				return;
			}

			setLoading(true);

			try {
				const res = await fetch(`${BASE_URL}/dashboard`, {
					method: "GET",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`
					},
				})

				if (!res.ok) {
					throw new Error("Failed to fetch dashboard");
				}

				const data = await res.json();
				setProjects(data.data);

			} catch (err) {
				setError(err instanceof Error ? err.message : "Something went wrong");
			} finally {
				setLoading(false);
			}
		}

		fetchData();
	}, [router]);

	if (loading) return <p>Loading...</p>
	if (error) return <p>{error}</p>

	const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		setProjectAdding(true);

		const token = localStorage.getItem("token");
		if (!token) {
			router.replace("/login");
			return;
		}

		try {
			const res = await fetch(`${BASE_URL}/projects`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ title: projectTitle })
			})

			if (!res.ok) {
				throw new Error("Failed to create the project");
			}

			const data = await res.json();
			const project = data.data;

			setProjects(prev => [
				{
					...project,
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

	const handleCancel = () => {
		setShowForm(false);
		setError(null);
		setProjectTitle("")
	}

	return (
		<div className="p-8 max-w-6xl mx-auto">

			{/* Header */}
			<div className="flex justify-between items-center mb-6">
				<div>
					<h1 className="text-2xl font-bold">My Projects</h1>
					<p className="text-sm text-gray-600">
						{projects.length} project{projects.length !== 1 && "s"}
					</p>
				</div>

				<button
					onClick={() => {
						setShowForm(prev => !prev);
						setError(null);
					}}
					className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
				>
					+ Create Project
				</button>
			</div>

			{/* Create Project Form */}
			{showForm && (
				<form
					onSubmit={handleSubmit}
					className="mb-6 bg-white p-5 rounded-xl shadow max-w-md flex flex-col gap-4"
				>
					<input
						required
						type="text"
						value={projectTitle}
						onChange={(e) => setProjectTitle(e.target.value)}
						placeholder="Project Title"
						className="border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>

					<div className="flex gap-3">
						<button
							type="submit"
							disabled={projectAdding}
							className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
						>
							{projectAdding ? "Creating..." : "Create"}
						</button>

						<button
							type="button"
							onClick={handleCancel}
							className="text-gray-500 hover:text-gray-700"
						>
							Cancel
						</button>
					</div>
				</form>
			)}

			{/* Projects List */}
			<div>
				{projects.length === 0 ? (
					<div className="text-gray-500 text-sm">No projects yet</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

						{projects.map((p) => (
							<Link
								key={p.id}
								href={`/projects/${p.id}`}
								className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
							>
								{/* Header */}
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<h2 className="truncate text-xl font-semibold text-gray-900 group-hover:text-blue-600">
											{p.title}
										</h2>

										<p className="mt-1 text-sm text-gray-500">
											{p.member_count} member{p.member_count !== 1 ? "s" : ""}
										</p>
									</div>

									<span
										className={
											p.my_role === "viewer"
												? "shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
												: p.my_role === "editor"
													? "shrink-0 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700"
													: p.my_role === "guide"
														? "shrink-0 rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700"
														: "shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
										}
									>
										{p.my_role ?? "owner"}
									</span>
								</div>

								{/* Stats */}
								<div className="mt-5 grid grid-cols-3 gap-3">
									<div className="rounded-xl bg-gray-50 p-3">
										<p className="text-xs text-gray-500">Todo</p>
										<p className="mt-1 text-lg font-semibold text-gray-900">
											{p.todo_count}
										</p>
									</div>

									<div className="rounded-xl bg-yellow-50 p-3">
										<p className="text-xs text-yellow-700">Progress</p>
										<p className="mt-1 text-lg font-semibold text-yellow-800">
											{p.in_progress_count}
										</p>
									</div>

									<div className="rounded-xl bg-green-50 p-3">
										<p className="text-xs text-green-700">Done</p>
										<p className="mt-1 text-lg font-semibold text-green-800">
											{p.done_count}
										</p>
									</div>
								</div>

								{/* Footer */}
								<div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
									<span className="text-sm font-medium text-blue-600 group-hover:underline">
										Open project
									</span>

									<span className="text-lg text-blue-500 transition group-hover:translate-x-1">
										→
									</span>
								</div>
							</Link>
						))}

					</div>
				)}
			</div>

		</div>
	);
}
