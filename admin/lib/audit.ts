// Writes one line to the audit log through the log_audit RPC, as the logged-in user.
// Usage: await logAudit('creators.exported', 'creator', null, { count: 12 });
// Never throws: a failed audit write must not break the action (it is logged to the server console).
import 'server-only';
import { createClient } from '@/lib/supabase/server';

export async function logAudit(
  action: string,
  entityType: string | null = null,
  entityId: string | null = null,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('log_audit', {
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
    });
    if (error) console.error('audit write failed', action, error.code);
  } catch (e) {
    console.error('audit write failed', action, e instanceof Error ? e.message : e);
  }
}
