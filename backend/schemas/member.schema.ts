import { z } from "zod";

const roleEnum = z.enum(["editor", "viewer"]);

export const addMemberSchema = z.object({
	user_id: z.number(),
	role: roleEnum,
});

export const updateMemberRoleSchema = z.object({
	role: roleEnum,
});

export const addGuideSchema = z.object({
	user_id: z.number(),
});
