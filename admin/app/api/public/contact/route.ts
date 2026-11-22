// Public: messages from the website's contact form. POST only. See lib/forms/public.ts for the shared checks.
import type { NextRequest } from 'next/server';
import { contactSchema } from '@/lib/forms/schemas';
import { handleForm, methodNotAllowed } from '@/lib/forms/public';

export const dynamic = 'force-dynamic';

export const POST = (req: NextRequest) =>
  handleForm(req, {
    fn: 'submit_contact',
    schema: contactSchema,
    args: (d, hash) => ({
      p_ip_hash: hash,
      p_name: d.name,
      p_email: d.email,
      p_topic: d.topic ?? null,
      p_message: d.message,
    }),
  });

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
