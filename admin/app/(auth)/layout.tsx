export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <div className="auth__card">
        <div className="auth__brand">Smallfold</div>
        <p className="auth__sub">Back office</p>
        {children}
      </div>
    </main>
  );
}
