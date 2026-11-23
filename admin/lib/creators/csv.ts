// CSV helpers: parsing an import file, building an export, formula-injection protection.
import Papa from 'papaparse';
import { MAX_IMPORT_ROWS } from './constants';
import { validateCreator, type CreatorInput, type CreatorField } from './schema';
import { channelKey } from '../youtube/channel';

export const CSV_COLUMNS = ['name', 'email', 'phone', 'channel_url', 'niche', 'subscribers', 'status', 'notes'] as const;
export const SAMPLE_CSV = [
  CSV_COLUMNS.join(','),
  'ZZ Sample Maya,maya.sample@example.test,+1 555 0100,https://www.youtube.com/@mayasample,Cooking,12500,new,Met at a meetup',
  'ZZ Sample Leo,leo.sample@example.test,,https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv,Woodworking,,contacted,',
  '',
].join('\r\n');

/**
 * Spreadsheet programs run cells that start with = + - @ tab or CR as formulas. A leading single quote makes them plain text.
 * Phone numbers (a + then only digits, spaces, brackets and dashes) are left alone so the export can be imported again.
 */
export function csvSafeCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/^\+[0-9 ()[\]-]+$/.test(s)) return s;
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Undoes the guard quote of csvSafeCell on import. */
const unguard = (v: string) => v.replace(/^'(?=[=+\-@\t\r])/, '');

export function toCsv(header: readonly string[], rows: unknown[][]): string {
  const esc = (v: unknown) => {
    const s = csvSafeCell(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n') + '\r\n';
}

export type ParsedFile = { ok: true; rows: Record<string, string>[]; badRows: Set<number> } | { ok: false; error: string };

export function parseCsvText(textIn: string): ParsedFile {
  const text = textIn.replace(/^﻿/, '');
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const fields = res.meta.fields ?? [];
  if (!fields.includes('name') || !fields.includes('email')) return { ok: false, error: 'The file needs a header row with at least the columns "name" and "email".' };
  const fatal = res.errors.find((e) => e.type === 'Quotes');
  if (fatal) return { ok: false, error: `The file is not valid CSV (row ${(fatal.row ?? 0) + 2}: ${fatal.message}).` };
  if (res.data.length > MAX_IMPORT_ROWS) return { ok: false, error: `The file has ${res.data.length} rows. The limit is ${MAX_IMPORT_ROWS}.` };
  if (res.data.length === 0) return { ok: false, error: 'The file has no rows.' };
  // A row with too few or too many columns would lose or cut off data (for example a note with an unquoted comma): it becomes an error row.
  const badRows = new Set<number>();
  res.data.forEach((row, i) => {
    if ('__parsed_extra' in row || fields.some((f) => !(f in row))) badRows.add(i);
  });
  return { ok: true, rows: res.data, badRows };
}

export type ExistingKeys = { emails: Set<string>; channels: Set<string> };
export type RowCheck = { line: number; name: string; email: string; status: 'new' | 'duplicate' | 'error'; reason?: string; data?: CreatorInput };

/** Classifies each row: error (invalid), duplicate (email or channel already in the DB or earlier in the file) or new. */
export function classifyRows(rows: Record<string, string>[], existing: ExistingKeys, badRows: Set<number> = new Set()): RowCheck[] {
  const seenEmail = new Map<string, number>();
  const seenChannel = new Map<string, number>();
  return rows.map((rawIn, i) => {
    const line = i + 2; // the header is line 1
    const raw: Record<string, string> = {};
    for (const [k, val] of Object.entries(rawIn)) raw[k] = typeof val === 'string' ? unguard(val) : val;
    if (badRows.has(i)) return { line, name: String(raw.name ?? '').trim(), email: String(raw.email ?? '').trim(), status: 'error', reason: 'Wrong number of columns. Put quotes around text that contains a comma.' };
    const v = validateCreator(raw as Partial<Record<CreatorField, unknown>>);
    const name = String(raw.name ?? '').trim();
    const email = String(raw.email ?? '').trim();
    if (!v.ok) return { line, name, email, status: 'error', reason: Object.values(v.errors).join(' ') };
    const d = v.data;
    const ekey = d.email.toLowerCase();
    const ckey = channelKey(d.channel_url);
    let reason: string | undefined;
    if (existing.emails.has(ekey)) reason = 'Email already exists in Smallfold.';
    else if (seenEmail.has(ekey)) reason = `Same email as line ${seenEmail.get(ekey)} in this file.`;
    else if (ckey && existing.channels.has(ckey)) reason = 'Channel already exists in Smallfold.';
    else if (ckey && seenChannel.has(ckey)) reason = `Same channel as line ${seenChannel.get(ckey)} in this file.`;
    if (reason) return { line, name: d.full_name, email: d.email, status: 'duplicate', reason };
    seenEmail.set(ekey, line);
    if (ckey) seenChannel.set(ckey, line);
    return { line, name: d.full_name, email: d.email, status: 'new', data: d };
  });
}
