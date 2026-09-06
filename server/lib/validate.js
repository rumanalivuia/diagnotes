import { z } from 'zod';

const richBlock = z
  .object({
    t: z.string(),
    r: z.array(z.object({ x: z.string() }).passthrough()).optional(),
    items: z.array(z.object({ r: z.array(z.any()) }).passthrough()).optional(),
  })
  .passthrough();

const commentBodySchema = z.array(richBlock).default([]);

const tagsSchema = z.array(z.string().trim().min(1)).max(20).default([]);

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    archived: z.union([z.number().int().min(0).max(1), z.boolean()]).optional(),
  })
  .refine((o) => o.name !== undefined || o.archived !== undefined, {
    message: 'nothing to update',
  });

export const createCommentSchema = z.object({
  title: z.string().trim().min(1).max(300),
  body: commentBodySchema.optional(),
  type: z.enum(['personal', 'shared']).optional(),
  status: z.string().trim().max(32).optional(),
  category_id: z.string().trim().max(64).nullable().optional(),
  tags: tagsSchema.optional(),
});

export const updateCommentSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    body: commentBodySchema.optional(),
    status: z.string().trim().max(32).optional(),
    category_id: z.string().trim().max(64).nullable().optional(),
    tags: tagsSchema.optional(),
    rejection_reason: z.string().trim().max(500).nullable().optional(),
    copy_count: z.number().int().min(0).optional(),
    deleted: z.union([z.number().int().min(0).max(1), z.boolean()]).optional(),
    archived: z.union([z.number().int().min(0).max(1), z.boolean()]).optional(),
  })
  .passthrough();

export const rejectSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

/** Return { ok, data } or { ok:false, error } with zod issues */
export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, data: r.data };
  return {
    ok: false,
    error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  };
}
