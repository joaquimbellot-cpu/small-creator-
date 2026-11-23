// Text that comes out of the database (creator names, deal brands, inbox messages ...) is DATA, never instructions.
// Before it goes into a tool result it is wrapped in <untrusted> tags, with angle brackets removed so the text
// cannot close the tag or open another one. The system prompt tells Claude what the tags mean.

// ASCII and look-alike angle brackets.
const BRACKETS = /[<>‹›⟨⟩〈〉＜＞]/g;

/** Removes the angle brackets only (keeps line breaks), for longer text such as a template body. */
export function stripBrackets(v: string): string {
  return v.replace(BRACKETS, '');
}

/** One line of cleaned text: no angle brackets, whitespace collapsed, cut to `max` characters. */
export function cleanText(v: string | null | undefined, max = 300): string {
  return (v ?? '').replace(BRACKETS, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Wraps database text for Claude. Null or empty text stays null. */
export function untrusted(v: string | null | undefined, max = 300): string | null {
  const text = cleanText(v, max);
  return text ? `<untrusted>${text}</untrusted>` : null;
}

/** Removes the tags again (for showing a tool result to the owner). */
export function unwrap(v: unknown): string {
  return typeof v === 'string' ? v.replace(/<\/?untrusted>/g, '') : '';
}
