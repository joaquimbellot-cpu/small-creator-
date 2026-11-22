// Shared by the server loop and the browser (no server-only imports here).
export const PROPOSAL_KINDS = ['creator.create', 'creator.update', 'deal.stage'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'failed';

/** One line of a proposal: the old and the new value. from is null for a new creator. */
export type ProposalChange = { label: string; from: string | null; to: string };
/** What a proposal does, built on the server from its stored payload (never from Claude's free text). */
export type ProposalDetail = { title: string; subject: string | null; changes: ProposalChange[] };

/** What the owner sees on a proposal card. The raw payload and Claude's free-text summary never leave the server. */
export type ProposalView = {
  id: string;
  kind: ProposalKind;
  detail: ProposalDetail | null;
  status: ProposalStatus;
  error: string | null;
};

/** One line per event, streamed from POST /api/assistant/chat as newline-delimited JSON. */
export type AssistantEvent =
  | { type: 'thread'; id: string }
  | { type: 'step'; tool: string; label: string; ok: boolean }
  | { type: 'draft'; emailId: string; creator: string }
  | { type: 'proposal'; proposal: ProposalView }
  | { type: 'text'; text: string }
  | { type: 'notice'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export const TOOL_LABEL: Record<string, string> = {
  get_overview_stats: 'Looked at the Overview numbers',
  search_creators: 'Searched creators',
  get_creator: 'Opened a creator',
  list_deals: 'Looked at deals',
  list_emails: 'Checked the email log',
  list_templates: 'Read the templates',
  list_inbox: 'Read the Inbox',
  create_email_draft: 'Wrote an email draft',
  propose_add_creator: 'Proposed adding a creator',
  propose_edit_creator: 'Proposed editing a creator',
  propose_deal_stage: 'Proposed a deal stage change',
};

export function toolLabel(tool: string): string {
  return TOOL_LABEL[tool] ?? 'Used a tool';
}
