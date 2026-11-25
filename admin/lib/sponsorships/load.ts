// Reads the records of one creator or one sponsor for the history component. Server only; uses the user's client (row security applies).
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { HistoryRecord, Origin, SponsorshipSide } from './types';

type Row = {
  id: string; creator_id: string; brand_id: string | null; brand_name_raw: string | null; sponsored_on: string | null;
  video_url: string | null; video_title: string | null; source_label: 'confirmed' | 'detected'; origin: Origin;
  detection_signal: string | null; detection_confidence: 'high' | 'medium' | 'low' | null; evidence_note: string | null;
  confirmed_at: string | null; rejected: boolean; created_at: string;
  brand: { name: string } | null;
  creator: { full_name: string; channel_name: string | null; subscribers: number | null } | null;
  confirmer: { full_name: string | null } | null;
};

const COLUMNS = `id, creator_id, brand_id, brand_name_raw, sponsored_on, video_url, video_title, source_label, origin, detection_signal,
  detection_confidence, evidence_note, confirmed_at, rejected, created_at,
  brand:brands(name), creator:creators(full_name, channel_name, subscribers), confirmer:profiles!sponsorships_confirmed_by_fkey(full_name)`;

export async function loadHistory(side: SponsorshipSide, id: string): Promise<HistoryRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('sponsorships').select(COLUMNS)
    .eq(side === 'creator' ? 'creator_id' : 'brand_id', id)
    .order('sponsored_on', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).order('id')
    .limit(500);
  if (error) throw new Error(`sponsorship history: ${error.code}`);
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id, creatorId: r.creator_id, creatorName: r.creator?.full_name ?? 'Unknown creator', creatorChannel: r.creator?.channel_name ?? null,
    creatorSubscribers: r.creator?.subscribers ?? null, brandId: r.brand_id, brandName: r.brand?.name ?? r.brand_name_raw, brandLinked: !!r.brand_id,
    sponsoredOn: r.sponsored_on, videoUrl: r.video_url, videoTitle: r.video_title, label: r.source_label, origin: r.origin,
    detectionSignal: r.detection_signal, detectionConfidence: r.detection_confidence, evidenceNote: r.evidence_note,
    confirmedByName: r.confirmer?.full_name ?? null, confirmedAt: r.confirmed_at, createdAt: r.created_at, rejected: r.rejected,
  }));
}
