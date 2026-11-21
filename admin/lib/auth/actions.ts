'use server';
// Logout (used by the shell). Writes the audit line, ends the session, goes to /login.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';
import { getCurrentStaff } from '@/lib/auth/staff';

export async function logoutAction() {
  const staff = await getCurrentStaff();
  if (staff) await logAudit('auth.logout', 'profile', staff.id, { label: staff.email });
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
