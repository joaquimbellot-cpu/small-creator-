// Badge colour for each email status.
export const STATUS_TONE: Record<string, 'neutral' | 'accent' | 'good' | 'warn' | 'bad'> = {
  draft: 'neutral', approved: 'accent', sending: 'warn', sent: 'good', failed: 'bad', replied: 'good',
};
