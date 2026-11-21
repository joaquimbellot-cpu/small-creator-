// The footer the server adds to every email. It is not editable and is built here only,
// so the review page preview and the real message can never differ.
export const SENDER_LINE = 'Smallfold, sponsors for small YouTube channels';

export function buildFooter(postalAddress: string | null | undefined, unsubscribeUrl: string): string {
  const lines = ['--', SENDER_LINE];
  if (postalAddress && postalAddress.trim()) lines.push(postalAddress.trim());
  lines.push('', `If you would rather not hear from us, open this link or reply 'unsubscribe': ${unsubscribeUrl}`);
  return lines.join('\n');
}

/** Body as it is sent: the draft, a blank line, then the footer. Plain text. */
export function buildText(body: string, footer: string): string {
  return `${body.trimEnd()}\n\n${footer}\n`;
}
