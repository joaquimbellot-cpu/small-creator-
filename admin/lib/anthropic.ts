// The one place that builds the Anthropic client (drafting and the Claude page both use it). SERVER ONLY.
// ANTHROPIC_API_KEY (and ANTHROPIC_BASE_URL, used by the local fake) are read by the SDK itself.
// The SDK default is a 10-minute timeout with 2 retries, which would hold a request open far past the host's limit,
// so a timeout is always set here. Callers pass a shorter one when they need it.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

export function createAnthropic(options: { timeout?: number; maxRetries?: number } = {}): Anthropic {
  return new Anthropic({ timeout: options.timeout ?? 120_000, maxRetries: options.maxRetries ?? 1 });
}
