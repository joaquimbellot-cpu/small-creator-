// CSV for sponsors: reading an import file, building an export, and the spreadsheet-formula guard.
import Papa from 'papaparse';
import { MAX_IMPORT_ROWS } from './constants';
import { validateImportRow, type ImportRowInput } from './schema';

export const CSV_COLUMNS = [
  'name', 'website', 'industry', 'country', 'company_size', 'niches', 'target_min_subs', 'target_max_subs', 'budget_min', 'budget_max',
  'relationship', 'notes', 'contact_name', 'contact_role', 'contact_email', 'contact_phone', 'contact_linkedin',
] as const;

export const SAMPLE_CSV = [
  CSV_COLUMNS.join(','),
  'ZZ Sample Kettle Co,https://kettle-sample.example.test,Kitchenware,US,11-50,cooking;diy,5k,50k,200,1000,prospect,Met at a trade show,Sam Sample,Partnerships,sam.sample@example.test,+1 555 0100,https://www.linkedin.com/in/sam-sample-example',
  'ZZ Sample Trail Gear,trail-sample.example.test,Outdoor gear,CA,51-200,Outdoors;Travel,1k,100k,"$500","$2,500",contacted,,,,,,',
  '',
].join('\r\n');

/**
 * Spreadsheet programs run cells that start with = + - @ tab or CR as formulas. On export a leading single quote makes them plain text.
 * A phone number (a + then only digits, spaces, brackets and dashes) is left alone so the export can be imported again.
 */
export function csvSafeCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/^\+[0-9 ()[\]-]+$/.test(s)) return s;
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** On import: undo the export quote, then strip leading formula characters (a phone keeps its +). */
export function cleanCell(value: string, column = ''): string {
  let s = value.replace(/^'(?=[=+\-@\t\r])/, '').trim();
  if (column === 'contact_phone' && /^\+[0-9 ()[\]-]+$/.test(s)) return s;
  s = s.replace(/^[=+\-@\t\r\s]+/, '');
  return s;
}

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
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim().toLowerCase() });
  const fields = res.meta.fields ?? [];
  if (!fields.includes('name')) return { ok: false, error: 'The file needs a header row with at least the column "name".' };
  const fatal = res.errors.find((e) => e.type === 'Quotes');
  if (fatal) return { ok: false, error: `The file is not valid CSV (row ${(fatal.row ?? 0) + 2}: ${fatal.message}).` };
  if (res.data.length > MAX_IMPORT_ROWS) return { ok: false, error: `The file has ${res.data.length} rows. The limit is ${MAX_IMPORT_ROWS}.` };
  if (res.data.length === 0) return { ok: false, error: 'The file has no rows.' };
  // Too few or too many columns would lose or cut off data (a note with an unquoted comma): that row becomes an error row.
  const badRows = new Set<number>();
  res.data.forEach((row, i) => {
    if ('__parsed_extra' in row || fields.some((f) => !(f in row))) badRows.add(i);
  });
  return { ok: true, rows: res.data, badRows };
}

export type RowCheck = { line: number; name: string; status: 'new' | 'duplicate' | 'error'; reason?: string; data?: ImportRowInput };

/** error (invalid), duplicate (name already in Smallfold or earlier in the file, letters of any case) or new. */
export function classifyRows(rows: Record<string, string>[], existingNames: Set<string>, badRows: Set<number> = new Set()): RowCheck[] {
  const seen = new Map<string, number>();
  return rows.map((rawIn, i) => {
    const line = i + 2; // the header is line 1
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawIn)) raw[k] = typeof v === 'string' ? cleanCell(v, k) : '';
    const name = raw.name ?? '';
    if (badRows.has(i)) return { line, name, status: 'error', reason: 'Wrong number of columns. Put quotes around text that contains a comma.' };
    const v = validateImportRow(raw);
    if (!v.ok) return { line, name, status: 'error', reason: v.reason };
    const key = v.data.sponsor.name.toLowerCase();
    if (existingNames.has(key)) return { line, name: v.data.sponsor.name, status: 'duplicate', reason: 'A sponsor with this name already exists.' };
    if (seen.has(key)) return { line, name: v.data.sponsor.name, status: 'duplicate', reason: `Same name as line ${seen.get(key)} in this file.` };
    seen.set(key, line);
    return { line, name: v.data.sponsor.name, status: 'new', data: v.data };
  });
}
