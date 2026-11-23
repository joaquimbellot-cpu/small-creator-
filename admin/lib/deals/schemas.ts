// Server-side validation for deal actions and filters (zod). Every action parses its input with these.
// Amounts come in as dollar text ("1,250.5", "$300") and leave as whole cents.
import { z } from 'zod';
import { STAGES } from './format';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const idSchema = z.string().regex(UUID, { error: 'Invalid id.' });
export const stageSchema = z.enum(STAGES, { error: 'Pick a valid stage.' });

const MAX_CENTS = 1_000_000_000; // 10,000,000 dollars

/** "1,250.5" -> 125050. Returns null when the text is not a plain dollar amount with at most 2 decimals. */
export function dollarsToCents(raw: string): number | null {
  const t = raw.trim().replace(/^\$/, '');
  // Commas only as thousands groups: "1,250" is fine, "1,2,3" is not.
  if (t.includes(',') && !/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(t)) return null;
  const s = t.replace(/,/g, '');
  const m = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

export const addDealSchema = z.object({
  creator_id: idSchema,
  brand_name: z.string().trim().min(1, 'Enter a brand name.').max(200, 'Brand names can be at most 200 characters.'),
  stage: stageSchema,
  amount: z.string().trim().transform((raw, ctx) => {
    const cents = dollarsToCents(raw);
    if (cents === null || cents <= 0 || cents > MAX_CENTS) {
      ctx.addIssue({ code: 'custom', message: 'Enter an amount above 0 and up to 10,000,000, with at most 2 decimals.' });
      return 0;
    }
    return cents;
  }),
});

export const updateStageSchema = z.object({ id: idSchema, stage: stageSchema });
export const deleteDealSchema = z.object({ id: idSchema });
