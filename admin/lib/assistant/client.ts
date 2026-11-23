// The Anthropic client for the assistant. SERVER ONLY.
// The client itself comes from lib/anthropic.ts (shared with drafting).
import 'server-only';

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const MAX_STEPS = 12;
export const MAX_TOKENS = 16000;

export function isConnected(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function assistantModel(): string {
  return process.env.ANTHROPIC_ASSISTANT_MODEL || DEFAULT_MODEL;
}

/** Owner messages allowed per day (UTC day). */
export function dailyLimit(): number {
  const n = Math.floor(Number(process.env.ASSISTANT_DAILY_LIMIT));
  return Number.isFinite(n) && n > 0 ? n : 100;
}

/**
 * How long one owner message may take, in ms. Default 270 s (Vercel allows 300).
 * Set ASSISTANT_DEADLINE_MS=50000 on Netlify, which stops a request after 60 s.
 */
export function deadlineMs(): number {
  const n = Math.floor(Number(process.env.ASSISTANT_DEADLINE_MS));
  return Number.isFinite(n) && n >= 15_000 ? Math.min(n, 270_000) : 270_000;
}

// Each call also gets its own timeout: the time left before the deadline (see loop.ts).
export { createAnthropic } from '@/lib/anthropic';
