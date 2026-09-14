import { z } from 'zod';

export const activityActions = [
	'PROJECT_CREATED', 'PROJECT_UPDATED',
	'TASK_CREATED', 'TASK_UPDATED', 'TASK_MOVED', 'TASK_ASSIGNED', 'TASK_DELETED',
	'MEMBER_ADDED', 'MEMBER_REMOVED', 'ROLE_CHANGED',
] as const;

export const activityQuerySchema = z.object({
	limit: z.string().regex(/^[1-9]\d{0,2}$/).default('20').transform(Number).refine(value => value <= 100),
	before: z.string().regex(/^[1-9]\d{0,18}$/)
		.pipe(z.string().refine(value => BigInt(value) <= 9223372036854775807n)).optional(),
	action: z.enum(activityActions).optional(),
}).strict();

export type ActivityQuery = z.infer<typeof activityQuerySchema>;
