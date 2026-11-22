// Validation for the public Apply and Contact forms (zod 4). Every field is trimmed and capped.
// Both schemas ignore fields they do not know (`_subject`, `_gotcha` are handled by the route).
import { z } from 'zod';

const name = z.string().trim().min(1).max(200);
const email = z.string().trim().max(320).regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/);
const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

export const applicationSchema = z.object({
  name,
  email,
  phone: optional(50),
  channel: z.string().trim().min(1).max(500),
  topic: z.string().trim().min(1).max(2000),
  // "12,500", "12 500", "12.500" and "12500" are all fine.
  subscribers: z
    .string()
    .trim()
    .regex(/^\d{1,3}(?:[ ,. ]\d{3})+$|^\d{1,9}$/)
    .transform((s) => Number(s.replace(/\D/g, ''))),
});

export const contactSchema = z.object({
  name,
  email,
  topic: optional(200),
  message: z.string().trim().min(1).max(5000),
});

export const messageIdSchema = z.guid();
export const filterSchema = z.enum(['open', 'handled', 'all']);
export type Filter = z.infer<typeof filterSchema>;
