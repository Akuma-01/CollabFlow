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
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [projects, setProjects] = useState<Project[]>([]);

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

	return (
		<div className="p-8">
			<h1 className="text-2xl font-bold">Dashboard</h1>
			<p>Welcome to CollabFlow</p>

			<div className="mt-4">
				<button className="px-4 py-2 bg-blue-600 text-white rounded">
					Create New Project
				</button>
			</div>

			<div className="mt-6">
				{projects.length === 0 ? (
					<p>No projects yet</p>
				) : (
					projects.map((p) => (

						<div
							key={p.id}
							className="border rounded-lg p-4 mb-4 shadow-sm hover:shadow-md transition cursor-pointer"
						>
							<div className="text-lg font-semibold">{p.title}</div>

							<div className="text-sm text-gray-600 mt-1">
								Role: {p.my_role ? p.my_role : "owner"}
							</div>

							<div className="mt-3 text-sm">
								<div>Members: {p.member_count}</div>
								<div>Todo: {p.todo_count}</div>
								<div>In Progress: {p.in_progress_count}</div>
								<div>Done: {p.done_count}</div>
							</div>

							<div className="mt-3">
								<Link
									href={`/projects/${p.id}`}
									className="text-blue-600 text-sm hover:underline"
								>
									Open Project →
								</Link>
							</div>
						</div>
					))
				)}

			</div>

		</div>
	)
}
