// Shared by the server loop and the browser (no server-only imports here).
export const PROPOSAL_KINDS = ['creator.create', 'creator.update', 'deal.stage'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'failed';

/** What the owner sees on a proposal card. The payload itself never leaves the server. */
export type ProposalView = {
  id: string;
  kind: ProposalKind;
  summary: string;
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
