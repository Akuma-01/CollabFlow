'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Member, Project, Task, User } from './types';
import { BeginMutation, createProjectSync, projectSocketUrl, SyncStatus } from './project-sync';

export function useProjectSync(projectId: string) {
	const [project, setProject] = useState<Project | null>(null);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [members, setMembers] = useState<Member[]>([]);
	const [currentUserId, setCurrentUserId] = useState<number | null>(null);
	const [denied, setDenied] = useState<number | null>(null);
	const [status, setStatus] = useState<SyncStatus>('connecting');
	const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
	const [revision, setRevision] = useState(0);
	const sync = useRef<ReturnType<typeof createProjectSync> | null>(null);

	useEffect(() => {
		let request: AbortController | undefined;
		const controller = createProjectSync({
			projectId: Number(projectId),
			read: async () => {
				request = new AbortController();
				const signal = request.signal;
				const timeout = setTimeout(() => request?.abort(), 15_000);
				try {
					const [me, project, members, tasks] = await Promise.all([
						api.get<{ data: User }>('/auth/me', signal),
						api.get<{ data: Project }>(`/projects/${projectId}`, signal),
						api.get<{ data: Member[] }>(`/projects/${projectId}/members`, signal),
						api.get<{ data: Task[] }>(`/projects/${projectId}/tasks`, signal),
					]);
					return { me: me.data, project: project.data, members: members.data, tasks: tasks.data };
				} finally { clearTimeout(timeout); request.abort(); }
			},
			connect: () => new WebSocket(projectSocketUrl(process.env.NEXT_PUBLIC_API_URL!, projectId)),
			onSnapshot: snapshot => {
				setCurrentUserId(snapshot.me.id);
				setProject(snapshot.project);
				setMembers(snapshot.members);
				setTasks(snapshot.tasks);
				setRevision(value => value + 1);
			},
			onStatus: setStatus,
			onPending: setPending,
			onDenied: code => {
				setProject(null); setTasks([]); setMembers([]); setCurrentUserId(null);
				setDenied(code);
			},
		});
		sync.current = controller;
		controller.start();
		const resume = () => { if (document.visibilityState === 'visible') controller.refresh(); };
		window.addEventListener('online', resume);
		document.addEventListener('visibilitychange', resume);
		return () => {
			controller.stop(); request?.abort(); sync.current = null;
			window.removeEventListener('online', resume);
			document.removeEventListener('visibilitychange', resume);
		};
	}, [projectId]);

	const beginMutation: BeginMutation = key => sync.current?.beginMutation(key);
	return { project, tasks, setTasks, members, currentUserId, denied, status, pending, revision,
		beginMutation, refresh: () => sync.current?.refresh() };
}
