// Turns an audit line into plain words for the table.
export type AuditRow = { id: number; actor_id: string | null; action: string; entity_type: string | null; entity_id: string | null; details: Record<string, unknown> | null; created_at: string };

const VERBS: Record<string, string> = {
  'auth.login': 'Logged in',
  'auth.logout': 'Logged out',
  'auth.password_changed': 'Changed password',
  'auth.2fa_enabled': 'Turned on two-step login',
  'auth.2fa_removed': 'Turned off two-step login',
  'user.invited': 'Invited a user',
  'user.removed': 'Removed a user',
  'user.restored': 'Restored a user',
  'creator.viewed': 'Viewed a creator',
  'creators.exported': 'Exported creators',
  'creators.imported': 'Imported creators',
};

export function describeAction(action: string): string {
  if (VERBS[action]) return VERBS[action];
  const [entity, verb] = action.split('.');
  if (!verb) return action;
  return `${verb.replace(/_/g, ' ')} ${entity.replace(/_/g, ' ')}`.replace(/^./, (c) => c.toUpperCase());
}

export function describeRecord(row: AuditRow): string {
  const d = row.details ?? {};
  const label = typeof d.label === 'string' ? d.label : null;
  return label ?? (row.entity_type ? `${row.entity_type}${row.entity_id ? ` ${row.entity_id.slice(0, 8)}` : ''}` : '');
}

export function describeDetails(row: AuditRow): string {
  const d = row.details ?? {};
  const changes = d.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  if (changes && typeof changes === 'object') {
    return Object.entries(changes)
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${show(v?.from)} → ${show(v?.to)}`)
      .join('; ');
  }
  return Object.entries(d)
    .filter(([k]) => k !== 'label')
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${show(v)}`)
    .join('; ');
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '–';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}
