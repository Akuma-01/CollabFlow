"use client"

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Project = {
	id: number;
	title: string;
	owner_id: number;
	member_count: string;
	task_count: string;
	todo_count: string;
	in_progress_count: string;
	done_count: string;
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

type ProjectRole = "owner" | "editor" | "viewer" | "guide";

type Member = {
	id: number;
	email: string;
	role: ProjectRole;
};

export default function ProjectClient({ projectId }: { projectId: string }) {
	const router = useRouter();
	const BASE_URL = process.env.NEXT_PUBLIC_API_URL!;

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [projectDetails, setProjectDetails] = useState<Project | null>(null);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [members, setMembers] = useState<Member[]>([]);

	useEffect(() => {
		const fetchData = async () => {
			const token = localStorage.getItem("token");

			if (!token) {
				router.replace("/login");
				return;
			}

			const authHeader = {
				Authorization: `Bearer ${token}`
			};

			const base = `${BASE_URL}/projects/${projectId}`;

			try {
				const [projectRes, membersRes, tasksRes] = await Promise.all([
					fetch(base, { headers: authHeader }),
					fetch(`${base}/members`, { headers: authHeader }),
					fetch(`${base}/tasks`, { headers: authHeader })
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
			<div className="flex-1 bg-white shadow rounded-xl p-4">
				<h2 className="text-lg font-semibold mb-3">Members</h2>
				<div className="space-y-2">
					{members.map((member) => (
						<div
							key={member.id}
							className="flex justify-between text-sm border-b pb-1"
						>
							<span>{member.email}</span>
							<span className="text-gray-500">{member.role}</span>
						</div>
					))}
				</div>
			</div>

			{/* Tasks */}
			<div className="flex-1 bg-white shadow rounded-xl p-4">
				<h2 className="text-lg font-semibold mb-3">Tasks</h2>
				<div className="space-y-2">
					{tasks.map((task) => (
						<div
							key={task.id}
							className="flex justify-between text-sm border-b pb-1"
						>
							<span>{task.title}</span>
							<span className="text-gray-500">{task.status}</span>
							<span className="text-gray-400">
								{task.assigned_to_name || "Unassigned"}
							</span>
						</div>
					))}
				</div>
			</div>

		</div>
	);
}
