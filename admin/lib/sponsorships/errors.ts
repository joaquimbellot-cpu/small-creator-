// Database refusals as plain sentences. Pure, so it is tested without a database.
type DbError = { code?: string; message?: string; details?: string } | null;

/** Turns a database refusal into a sentence a person can act on. */
export function plainError(error: DbError): string {
  const m = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  if (error?.code === '23505') return 'That video is already recorded for this creator and sponsor.';
  if (error?.code === '23503') return 'The creator or the sponsor no longer exists. Refresh the page.';
  if (m.includes('evidence note')) return 'Say how you checked it.';
  if (m.includes('cannot be rejected')) return 'A confirmed record cannot be rejected. Ask the owner to delete it.';
  if (m.includes('restore a rejected record before')) return 'Restore this record before changing it.';
  if (m.includes('back to detected')) return 'A confirmed record cannot go back to Detected.';
  if (m.includes('deals only') || m.includes('database only')) return 'Records from deals are made by Smallfold itself.';
  if (error?.code === '42501') return 'You do not have permission to do that.';
  if (error?.code === '23514') return 'The database refused this record. Check the date, the video link and the notes.';
  return 'Could not save. Please try again.';
}

