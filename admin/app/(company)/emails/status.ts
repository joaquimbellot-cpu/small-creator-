// Badge colour for each email status.
export const STATUS_TONE: Record<string, 'neutral' | 'accent' | 'good' | 'warn' | 'bad'> = {
  draft: 'neutral', approved: 'accent', sending: 'warn', sent: 'good', failed: 'bad', replied: 'good',
};

// The same words with a capital, for badges and filters.
export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', approved: 'Approved', sending: 'Sending', sent: 'Sent', failed: 'Failed', replied: 'Replied',
};
