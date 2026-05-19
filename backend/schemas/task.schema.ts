import { z } from "zod";

const statusEnum = z.enum(["todo", "in_progress", "done"]);

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.optional();

export const createTaskSchema = z.object({
	title: z.string().min(1, 'Title is required'),
	description: z.string().optional(),
	deadline: isoDate,
	assigned_to: z.number().nullable().optional(),
});

export const updateTaskSchema = z.object({
	title: z.string().min(1).optional(),
	description: z.string().optional(),
	deadline: isoDate,
});

export const assignTaskSchema = z.object({
	assigned_to: z.number().nullable(),
})

export const updateTaskStatusSchema = z.object({
	status: statusEnum,
})
