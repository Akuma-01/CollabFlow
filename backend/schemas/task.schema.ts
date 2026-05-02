import { z } from "zod";

const statusEnum = z.enum(["todo", "in_progress", "done"]);

export const createTaskSchema = z.object({
	title: z.string(),
	description: z.string().optional(),
	deadline: z.string().optional(),
});

export const updateTaskSchema = z.object({
	title: z.string().optional(),
	description: z.string().optional(),
	deadline: z.string().optional(),
});

export const assignTaskSchema = z.object({
	assigned_to: z.number().nullable(),
})

export const updateTaskStatusSchema = z.object({
	status: statusEnum,
})
