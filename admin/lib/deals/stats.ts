// Shapes returned by the stats_overview() and recent_activity() database functions.
// The numbers are shown as the database returns them; nothing is computed in the app.
import type { Stage } from './format';

export type WeekPoint = { week_start: string; sent: number; replies: number };

export type Overview = {
  total_creators: number;
  emails_sent_all: number;
  emails_sent_7d: number;
  emails_sent_30d: number;
  replies: number;
  reply_rate: number; // already a percentage with one decimal
  deals_by_stage: Record<Stage, number>;
  active_deals: number;
  commission_earned_cents: number;
  emails_failed_7d?: number; // added by a later migration; show 0 when missing
  weekly: WeekPoint[]; // 12 entries, oldest first
};

export type ActivityRow = {
  created_at: string;
  actor_name: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  summary: string;
};
