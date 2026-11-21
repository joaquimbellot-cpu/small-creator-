// Public layout for the unsubscribe page: no login, no navigation, same look as the login pages.
export default function UnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <div className="auth__card">
        <div className="auth__brand">Smallfold</div>
        <p className="auth__sub">Sponsors for small YouTube channels</p>
        {children}
      </div>
    </main>
  );
}
