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
				const res = await fetch("http://localhost:3000/dashboard", {
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
							<div
								key={p.id}
								className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition"
							>
								{/* Title */}
								<div className="text-lg font-semibold">{p.title}</div>

								{/* Role */}
								<div className="text-sm text-gray-500 mt-1">
									Role: {p.my_role ? p.my_role : "owner"}
								</div>

								{/* Stats */}
								<div className="mt-3 text-sm text-gray-700 space-y-1">
									<div>Members: {p.member_count ?? 0}</div>
									<div>Todo: {p.todo_count ?? 0}</div>
									<div>In Progress: {p.in_progress_count ?? 0}</div>
									<div>Done: {p.done_count ?? 0}</div>
								</div>

								{/* Action */}
								<div className="mt-4">
									<Link
										href={`/projects/${p.id}`}
										className="text-blue-600 text-sm hover:underline"
									>
										Open Project →
									</Link>
								</div>
							</div>
						))}

					</div>
				)}
			</div>

		</div>
	);
}
