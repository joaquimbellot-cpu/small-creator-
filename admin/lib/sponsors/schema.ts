// Checks for the add / edit sponsor form, the contact person form and a row of the import file.
// Everything the person types is checked here (on the server, and again in the browser tests); the database has its own limits as a second line.
import { z } from 'zod';
import { parseShortNumber } from '../lists/numbers';
import { COMPANY_SIZES, COUNTRY_CODES, NICHES, NICHE_SLUGS, RELATIONSHIPS, RELATIONSHIP_LABEL, COMPANY_SIZE_LABEL, countryName } from './constants';

export type SponsorField =
  | 'name' | 'website' | 'industry' | 'country' | 'company_size' | 'niches' | 'target_min_subs' | 'target_max_subs'
  | 'budget_min' | 'budget_max' | 'relationship' | 'notes';
export type ContactField = 'full_name' | 'role_title' | 'email' | 'phone' | 'linkedin_url';

export type SponsorInput = {
  name: string; website: string | null; industry: string | null; country: string | null; company_size: string | null;
  target_niches: string[]; target_min_subs: number | null; target_max_subs: number | null;
  budget_min_cents: number | null; budget_max_cents: number | null; relationship: string; notes: string | null;
};
export type ContactInput = { full_name: string; role_title: string | null; email: string | null; phone: string | null; linkedin_url: string | null };

type Raw = Partial<Record<string, unknown>>;
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const orNull = (s: string) => (s === '' ? null : s);

/** "$1,000", "250", "1.5k", "$2.50" to whole cents. null when it is not a money amount. */
export function parseUsdToCents(input: string): number | null {
  const m = /^\s*\$?\s*(\d[\d,]*(?:\.\d{1,2})?|\.\d{1,2})\s*([kKmM]?)\s*$/.exec(input);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  const mult = /k/i.test(m[2]) ? 1e3 : /m/i.test(m[2]) ? 1e6 : 1;
  const cents = Math.round(n * mult * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** A web address typed as "example.com" or "https://example.com/x". Only https is kept; returns null when it is not one. */
export function normalizeWebsite(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https:\/\//i.test(s)) return null; // javascript:, http:, mailto: ...
  const withScheme = /^https:\/\//i.test(s) ? s : `https://${s.replace(/^\/\//, '')}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' || !u.hostname.includes('.') || /\s/.test(s) || u.username || u.password) return null;
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** True for a link we can put in an href: https and a host with a dot. */
export const isHttpsUrl = (s: string | null | undefined) => !!s && normalizeWebsite(s) === s.replace(/\/$/, '');

export function normalizeLinkedIn(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const url = /^https:\/\//i.test(s) ? s : /^(www\.)?linkedin\.com\//i.test(s) ? `https://${s}` : null;
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    const h = u.hostname.toLowerCase();
    if (h !== 'linkedin.com' && !h.endsWith('.linkedin.com')) return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Slug or label ("Prospect", "In talks") to the stored value. */
export function parseRelationship(input: string): string | null {
  const v = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!v) return null;
  const direct = RELATIONSHIPS.find((r) => r === v.replace(/[ -]/g, '_'));
  if (direct) return direct;
  return RELATIONSHIPS.find((r) => RELATIONSHIP_LABEL[r].toLowerCase() === v) ?? null;
}

export function parseCompanySize(input: string): string | null {
  const v = input.trim().toLowerCase().replace(/[, ]/g, '');
  if (!v) return null;
  if ((COMPANY_SIZES as readonly string[]).includes(v)) return v;
  const to = v.replace('to', '-');
  if ((COMPANY_SIZES as readonly string[]).includes(to)) return to;
  if (/^(over|more than|above)?1000\+?$/.test(v) || v === 'over1000') return '1000+';
  return COMPANY_SIZES.find((s) => COMPANY_SIZE_LABEL[s].toLowerCase().replace(/[, ]/g, '') === v) ?? null;
}

export function parseCountry(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  if (/^[A-Za-z]{2}$/.test(v) && (COUNTRY_CODES as string[]).includes(v.toUpperCase())) return v.toUpperCase();
  const low = v.toLowerCase();
  return COUNTRY_CODES.find((c) => countryName(c).toLowerCase() === low) ?? null;
}

/** "tech; Gaming" or "Cooking and food|diy" to slugs. Returns the unknown words too. */
export function parseNiches(input: string | string[]): { slugs: string[]; unknown: string[] } {
  const parts = (Array.isArray(input) ? input : input.split(/[;|,]/)).map((x) => x.trim()).filter(Boolean);
  const slugs: string[] = [];
  const unknown: string[] = [];
  for (const part of parts) {
    const low = part.toLowerCase();
    const hit = NICHES.find((n) => n.slug === low || n.name.toLowerCase() === low);
    if (!hit) unknown.push(part);
    else if (!slugs.includes(hit.slug)) slugs.push(hit.slug);
  }
  return { slugs, unknown };
}

const EMAIL_RE = /^[^@\s,;<>]+@[^@\s,;<>]+$/;
const PHONE_RE = /^[0-9 +()./-]{3,50}$/;

// Text limits as zod schemas (the rest of the checks, such as "5k" or "https only", need their own parsing below).
const sponsorText = z.object({
  name: z.string().min(1, 'Enter the company name.').max(200, 'The name can be up to 200 characters.'),
  website: z.string().max(500, 'The web address can be up to 500 characters.'),
  industry: z.string().max(200, 'The industry can be up to 200 characters.'),
  notes: z.string().max(5000, 'Notes can be up to 5,000 characters.'),
});
const contactText = z.object({
  full_name: z.string().min(1, 'Enter the name.').max(200, 'The name can be up to 200 characters.'),
  role_title: z.string().max(200, 'The role can be up to 200 characters.'),
  email: z.string().max(320, 'Enter a valid email address.').refine((v) => v === '' || EMAIL_RE.test(v), 'Enter a valid email address.'),
  phone: z.string().refine((v) => v === '' || PHONE_RE.test(v), 'Use digits, spaces and + - ( ) only, up to 50 characters.'),
  linkedin_url: z.string().max(500, 'The LinkedIn address can be up to 500 characters.'),
});
function zodErrors<K extends string>(r: { success: boolean; error?: z.ZodError }, errors: Partial<Record<K, string>>) {
  if (r.success || !r.error) return;
  for (const issue of r.error.issues) { const k = issue.path[0] as K; if (!errors[k]) errors[k] = issue.message; }
}

type Result<T, F extends string> = { ok: true; data: T } | { ok: false; errors: Partial<Record<F, string>> };

function subs(v: string, label: string, errors: Partial<Record<SponsorField, string>>, key: SponsorField): number | null {
  if (!v) return null;
  const n = parseShortNumber(v);
  if (n == null || n < 0 || n > 2_000_000_000) { errors[key] = `${label} must be a number such as 5000 or 5k.`; return null; }
  return n;
}
function dollars(v: string, label: string, errors: Partial<Record<SponsorField, string>>, key: SponsorField): number | null {
  if (!v) return null;
  const c = parseUsdToCents(v);
  if (c == null || c > 1e12) { errors[key] = `${label} must be an amount in dollars such as 250 or 1,000.`; return null; }
  return c;
}

/** Fields as typed (strings). `niches` may be an array (form check boxes) or text (import file). */
export function validateSponsor(raw: Raw): Result<SponsorInput, SponsorField> {
  const errors: Partial<Record<SponsorField, string>> = {};
  const name = text(raw.name);
  const websiteRaw = text(raw.website);
  const industry = text(raw.industry);
  const notes = text(raw.notes);
  zodErrors(sponsorText.safeParse({ name, website: websiteRaw, industry, notes }), errors);
  const website = websiteRaw ? normalizeWebsite(websiteRaw) : null;
  if (websiteRaw && !errors.website && (!website || website.length > 500)) errors.website = 'Enter a web address that starts with https://, such as https://example.com.';
  const countryRaw = text(raw.country);
  const country = countryRaw ? parseCountry(countryRaw) : null;
  if (countryRaw && !country) errors.country = 'Choose a country from the list, or use its two-letter code.';
  const sizeRaw = text(raw.company_size);
  const company_size = sizeRaw ? parseCompanySize(sizeRaw) : null;
  if (sizeRaw && !company_size) errors.company_size = 'Use one of 1 to 10, 11 to 50, 51 to 200, 201 to 1,000 or Over 1,000.';
  const nicheIn = Array.isArray(raw.niches) ? (raw.niches as unknown[]).map(text) : text(raw.niches);
  const { slugs, unknown } = parseNiches(nicheIn);
  if (unknown.length) errors.niches = `Unknown niche: ${unknown.slice(0, 3).join(', ')}.`;
  const target_min_subs = subs(text(raw.target_min_subs), 'Target size, from', errors, 'target_min_subs');
  const target_max_subs = subs(text(raw.target_max_subs), 'Target size, to', errors, 'target_max_subs');
  if (!errors.target_max_subs && target_min_subs != null && target_max_subs != null && target_min_subs > target_max_subs) errors.target_max_subs = 'The "to" size cannot be below the "from" size.';
  const budget_min_cents = dollars(text(raw.budget_min), 'Budget, from', errors, 'budget_min');
  const budget_max_cents = dollars(text(raw.budget_max), 'Budget, to', errors, 'budget_max');
  if (!errors.budget_max && budget_min_cents != null && budget_max_cents != null && budget_min_cents > budget_max_cents) errors.budget_max = 'The "to" budget cannot be below the "from" budget.';
  const relRaw = text(raw.relationship);
  const relationship = relRaw ? parseRelationship(relRaw) : 'prospect';
  if (!relationship) errors.relationship = 'Choose a contact status from the list.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name, website, industry: orNull(industry), country, company_size, target_niches: slugs.filter((s) => NICHE_SLUGS.includes(s)),
      target_min_subs, target_max_subs, budget_min_cents, budget_max_cents, relationship: relationship!, notes: orNull(notes),
    },
  };
}

export function validateContact(raw: Raw): Result<ContactInput, ContactField> {
  const errors: Partial<Record<ContactField, string>> = {};
  const full_name = text(raw.full_name);
  const role = text(raw.role_title);
  const email = text(raw.email);
  const phone = text(raw.phone);
  const lin = text(raw.linkedin_url);
  zodErrors(contactText.safeParse({ full_name, role_title: role, email, phone, linkedin_url: lin }), errors);
  const linkedin_url = lin ? normalizeLinkedIn(lin) : null;
  if (lin && !errors.linkedin_url && !linkedin_url) errors.linkedin_url = 'Enter a LinkedIn address that starts with https://www.linkedin.com/.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { full_name, role_title: orNull(role), email: orNull(email), phone: orNull(phone), linkedin_url } };
}

/** One import row: the sponsor plus the optional contact person. */
export type ImportRowInput = { sponsor: SponsorInput; contact: ContactInput | null };

export function validateImportRow(raw: Record<string, string>): { ok: true; data: ImportRowInput } | { ok: false; reason: string } {
  const s = validateSponsor({
    name: raw.name, website: raw.website, industry: raw.industry, country: raw.country, company_size: raw.company_size, niches: raw.niches,
    target_min_subs: raw.target_min_subs, target_max_subs: raw.target_max_subs, budget_min: raw.budget_min, budget_max: raw.budget_max,
    relationship: raw.relationship, notes: raw.notes,
  });
  const anyContact = ['contact_name', 'contact_role', 'contact_email', 'contact_phone', 'contact_linkedin'].some((k) => text(raw[k]));
  const c = anyContact
    ? validateContact({ full_name: raw.contact_name, role_title: raw.contact_role, email: raw.contact_email, phone: raw.contact_phone, linkedin_url: raw.contact_linkedin })
    : null;
  const reasons: string[] = [];
  if (!s.ok) reasons.push(...Object.values(s.errors));
  if (c && !c.ok) reasons.push(...Object.values(c.errors).map((m) => `Contact: ${m}`));
  if (reasons.length) return { ok: false, reason: reasons.join(' ') };
  return { ok: true, data: { sponsor: (s as { ok: true; data: SponsorInput }).data, contact: c && c.ok ? c.data : null } };
}
