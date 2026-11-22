// Public: brand inquiries from the website (brands.html). POST only. See lib/forms/public.ts for the shared checks.
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
      p_topic: 'Brand inquiry',
      // A short readable summary. The phone and email have their own columns and are never part of the text.
      p_message: `${d.company} wants to promote: ${d.promote}\nBudget: ${d.budget}`,
      p_company: d.company,
      p_budget: d.budget,
      p_phone: d.phone ?? null,
    }),
  });

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
