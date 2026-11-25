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
  'creator.created': 'Added a creator',
  'creator.updated': 'Changed a creator',
  'creator.deleted': 'Deleted a creator',
  'creator.subscribers_refreshed': "Refreshed a creator's subscribers",
  'brand.viewed': 'Viewed a sponsor',
  'brand.created': 'Added a sponsor',
  'brand.updated': 'Changed a sponsor',
  'brand.deleted': 'Deleted a sponsor',
  'brands.exported': 'Exported sponsors',
  'brands.imported': 'Imported sponsors',
  'brand_contact.created': 'Added a contact person at a sponsor',
  'brand_contact.updated': 'Changed a contact person at a sponsor',
  'brand_contact.deleted': 'Removed a contact person at a sponsor',
  'sponsorships.imported': 'Imported sponsorship records',
  'sponsorship.created': 'Added a sponsorship record',
  'sponsorship.updated': 'Changed a sponsorship record',
  'sponsorship.deleted': 'Deleted a sponsorship record',
  'sponsorship.confirmed': 'Confirmed a detected sponsorship',
  'sponsorship.rejected': 'Rejected a detected sponsorship',
  'sponsorship.restored': 'Restored a rejected sponsorship',
  'list.created': 'Created a list',
  'list.updated': 'Changed a list',
  'list.deleted': 'Deleted a list',
  'deal.created': 'Added a deal',
  'deal.updated': 'Changed a deal',
  'deal.deleted': 'Deleted a deal',
  'email.drafted': 'Drafted an email',
  'email.unsubscribed': 'Someone unsubscribed from emails',
  'profile.created': 'Added a team member',
  'profile.deleted': 'Removed a team member',
  'settings.updated': 'Changed a setting',
  'creators.exported': 'Exported creators',
  'creators.imported': 'Imported creators',
  'contact.viewed': 'Viewed an Inbox message',
  'contact.received': 'Inbox message from the website',
  'application.received': 'Application from the website',
  'email.status_changed': "Changed an email's status",
  'suppression.created': 'Blocked an address from emails',
  'suppression.deleted': 'Allowed an address again',
  'profile.role_changed': "Changed someone's role",
  'assistant.thread_deleted': 'Deleted a Claude conversation',
  'assistant.message': 'Asked Claude',
  'assistant.proposal_approved': "Approved Claude's change",
  'assistant.proposal_rejected': "Rejected Claude's change",
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
