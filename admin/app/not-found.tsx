import { LinkButton } from '@/components/ui';

// Any address the site does not know. Outside the shell, so it needs no login.
export default function NotFound() {
  return (
    <main className="state state--page">
      <h1 className="state__title">We could not find that page</h1>
      <p className="state__text">The address may be old, or the page may have moved.</p>
      <div className="state__actions"><LinkButton href="/overview">Back to the Overview</LinkButton></div>
    </main>
  );
}
