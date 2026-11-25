import { LinkButton } from '@/components/ui';

export default function SponsorNotFound() {
  return (
    <div className="state">
      <h1 className="state__title">This sponsor does not exist</h1>
      <p className="state__text">The address may be old, or the sponsor may have been deleted.</p>
      <div className="state__actions"><LinkButton href="/sponsors">Back to sponsors</LinkButton></div>
    </div>
  );
}
