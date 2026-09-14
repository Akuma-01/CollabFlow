import { ProjectRole, TaskStatus } from './index';

export type PersonSnapshot = { id: number; name: string };
export type TaskChanges = Partial<Record<'title' | 'description' | 'deadline', { from: string | null; to: string | null }>>;
export type AssignmentReason = 'member_removed' | 'role_changed';
type MemberRole = Exclude<ProjectRole, 'owner'>;

export type ActivityEvent = { projectId: number; actorId: number; entityId: number } & (
	{ entityType: 'project' } & (
		{ action: 'PROJECT_CREATED'; metadata: { title: string } } |
		{ action: 'PROJECT_UPDATED'; metadata: { from: { title: string }; to: { title: string } } }
	) |
	{ entityType: 'task' } & (
		{ action: 'TASK_CREATED'; metadata: { title: string; status: TaskStatus; deadline: string | null; assignee: PersonSnapshot | null } } |
		{ action: 'TASK_UPDATED'; metadata: { title: string; changes: TaskChanges } } |
		{ action: 'TASK_MOVED'; metadata: { title: string; from: TaskStatus; to: TaskStatus } } |
		{ action: 'TASK_ASSIGNED'; metadata: { title: string; from: PersonSnapshot | null; to: PersonSnapshot | null; reason?: AssignmentReason } } |
		{ action: 'TASK_DELETED'; metadata: { title: string; status: TaskStatus } }
	) |
	{ entityType: 'member' } & (
		{ action: 'MEMBER_ADDED' | 'MEMBER_REMOVED'; metadata: { member: PersonSnapshot; role: MemberRole } } |
		{ action: 'ROLE_CHANGED'; metadata: { member: PersonSnapshot; from: MemberRole; to: MemberRole } }
	)
);
