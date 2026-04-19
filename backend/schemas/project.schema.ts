import { z } from "zod";

export const createProjectSchema = z.object({
	title: z.string().min(1, "Title is required"),
})

export const updateProjectSchema = z.object({
	title: z.string().min(1, "Title is required").optional(),
})
