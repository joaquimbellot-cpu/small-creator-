// The Anthropic client for the assistant. SERVER ONLY.
// ANTHROPIC_API_KEY (and ANTHROPIC_BASE_URL, used by the local fake) are read by the SDK itself.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

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

export function createAnthropic(): Anthropic {
  // One call may take a while at medium effort; the route as a whole stops at 270 s (maxDuration is 300).
  return new Anthropic({ timeout: 120_000, maxRetries: 1 });
}
