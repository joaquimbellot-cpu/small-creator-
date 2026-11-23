// Shown while the next page loads, so a slow change does not look frozen.
export default function Loading() {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading__bar" aria-hidden="true" />
      Loading…
    </div>
  );
}
