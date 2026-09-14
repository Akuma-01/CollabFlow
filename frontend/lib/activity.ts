export const ACTIVITY_FILTERS = [
	['PROJECT_CREATED', 'Project created'], ['PROJECT_UPDATED', 'Project renamed'],
	['TASK_CREATED', 'Task created'], ['TASK_UPDATED', 'Task edited'],
	['TASK_MOVED', 'Task moved'], ['TASK_ASSIGNED', 'Assignment changed'], ['TASK_DELETED', 'Task deleted'],
	['MEMBER_ADDED', 'Member added'], ['MEMBER_REMOVED', 'Member removed'], ['ROLE_CHANGED', 'Role changed'],
] as const;

export type ActivityAction = typeof ACTIVITY_FILTERS[number][0];
export interface ActivityRecord {
	id: string;
	project_id: number;
	actor_id: number | null;
	actor_name: string;
	action: string;
	entity_type: string;
	entity_id: number;
	metadata: Record<string, unknown>;
	created_at: string;
}
export interface ActivityPage { data: ActivityRecord[]; nextCursor: string | null }
interface Detail { label: string; from?: string; to: string }
interface Description { summary: string; details: Detail[]; note?: string; expandable?: boolean }

const object = (value: unknown): Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback: string) => typeof value === 'string' ? value : fallback;
const person = (value: unknown) => value === null ? 'Unassigned' : text(object(value).name, 'Unknown member');
const statusLabels = new Map([['todo', 'Todo'], ['in_progress', 'In Progress'], ['done', 'Done']]);
const roleLabels = new Map([['editor', 'Editor'], ['viewer', 'Viewer'], ['guide', 'Guide']]);
const status = (value: unknown) => statusLabels.get(text(value, '')) ?? 'Unknown status';
const role = (value: unknown) => roleLabels.get(text(value, '')) ?? 'Unknown role';
const fieldValue = (value: unknown) => value === '' ? '(empty)' : text(value, 'Not set');

// Treat stored metadata as a versioned external payload. Unknown events or
// missing fields must not crash the rest of the feed. Render all text via React.
export function describeActivity(event: ActivityRecord): Description {
	const m = object(event.metadata);
	const title = `“${text(m.title, 'Untitled task')}”`;
	switch (event.action) {
		case 'PROJECT_CREATED': return { summary: `created project “${text(m.title, 'Untitled project')}”`, details: [] };
		case 'PROJECT_UPDATED': return { summary: 'renamed the project', details: [
			{ label: 'Title', from: fieldValue(object(m.from).title), to: fieldValue(object(m.to).title) },
		] };
		case 'TASK_CREATED': return { summary: `created task ${title}`, details: [
			{ label: 'Status', to: status(m.status) }, { label: 'Assignee', to: person(m.assignee) },
			...(m.deadline ? [{ label: 'Deadline', to: fieldValue(m.deadline) }] : []),
		] };
		case 'TASK_UPDATED': {
			const changes = object(m.changes);
			const details = (['title', 'description', 'deadline'] as const).filter(field => field in changes).map(field => ({
				label: field[0].toUpperCase() + field.slice(1),
				from: fieldValue(object(changes[field]).from), to: fieldValue(object(changes[field]).to),
			}));
			return { summary: `edited task ${title}`, details, expandable: true };
		}
		case 'TASK_MOVED': return { summary: `moved task ${title}`, details: [{ label: 'Status', from: status(m.from), to: status(m.to) }] };
		case 'TASK_ASSIGNED': return {
			summary: m.to === null ? `unassigned task ${title}` : `assigned task ${title} to ${person(m.to)}`,
			details: [{ label: 'Assignee', from: person(m.from), to: person(m.to) }],
			note: m.reason === 'member_removed' ? 'Automatically unassigned because the member was removed.'
				: m.reason === 'role_changed' ? 'Automatically unassigned because the member became a guide.' : undefined,
		};
		case 'TASK_DELETED': return { summary: `deleted task ${title}`, details: [{ label: 'Last status', to: status(m.status) }] };
		case 'MEMBER_ADDED': return { summary: `added ${person(m.member)} as ${role(m.role)}`, details: [] };
		case 'MEMBER_REMOVED': return { summary: `removed ${person(m.member)} from the project`, details: [{ label: 'Previous role', to: role(m.role) }] };
		case 'ROLE_CHANGED': return { summary: `changed ${person(m.member)}’s role`, details: [{ label: 'Role', from: role(m.from), to: role(m.to) }] };
		default: return { summary: 'updated the project', details: [], note: 'Details for this activity are unavailable.' };
	}
}

export function activityPath(projectId: string, action: ActivityAction | '', before?: string): string {
	const query = new URLSearchParams({ limit: '20' });
	if (action) query.set('action', action);
	if (before) query.set('before', before);
	return `/projects/${encodeURIComponent(projectId)}/activity?${query}`;
}
