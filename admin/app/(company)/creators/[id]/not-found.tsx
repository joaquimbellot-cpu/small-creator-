import { LinkButton } from '@/components/ui';

export default function CreatorNotFound() {
  return (
    <div className="state">
      <h1 className="state__title">This creator does not exist</h1>
      <p className="state__text">The address may be old, or the creator may have been deleted.</p>
      <div className="state__actions"><LinkButton href="/creators">Back to creators</LinkButton></div>
    </div>
  );
}
