// Public: creator applications from the website. POST only. See lib/forms/public.ts for the shared checks.
import type { NextRequest } from 'next/server';
import { applicationSchema } from '@/lib/forms/schemas';
import { handleForm, methodNotAllowed } from '@/lib/forms/public';

export const dynamic = 'force-dynamic';

export const POST = (req: NextRequest) =>
  handleForm(req, {
    fn: 'submit_application',
    schema: applicationSchema,
    args: (d, hash) => ({
      p_ip_hash: hash,
      p_name: d.name,
      p_email: d.email,
      p_phone: d.phone,
      p_channel_url: d.channel,
      p_subscribers: d.subscribers,
      p_niche: d.niche,
      p_notes: d.notes,
    }),
  });

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
