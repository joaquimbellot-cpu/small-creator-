import { LinkButton } from '@/components/ui';

export default function CompanyNotFound() {
  return (
    <div className="state">
      <h1 className="state__title">We could not find that page</h1>
      <p className="state__text">The address may be old, or the record may have been deleted.</p>
      <div className="state__actions"><LinkButton href="/overview">Back to the Overview</LinkButton></div>
    </div>
  );
}
