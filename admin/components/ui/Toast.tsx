'use client';
// Short messages at the bottom centre. Each toast has role="status" and goes away after 6 seconds.
// ToastProvider is already mounted in AppShell, so in any company page:
//   const toast = useToast();
//   toast('Saved view created.');
//   toast('Linked Ada with Acme.', { label: 'View on the board', onClick: () => router.push('/deals') });
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import k from './kit.module.css';

export type ToastAction = { label: string; onClick: () => void };
type ToastFn = (message: string, action?: ToastAction) => void;
type Item = { id: number; message: string; action?: ToastAction };

const Ctx = createContext<ToastFn | null>(null);
const LIFETIME = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((all) => all.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback<ToastFn>((message, action) => {
    const id = next.current++;
    setItems((all) => [...all.slice(-3), { id, message, action }]);
    timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME));
  }, [dismiss]);

  useEffect(() => { const m = timers.current; return () => { m.forEach(clearTimeout); m.clear(); }; }, []);
  const value = useMemo(() => toast, [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className={k.toasts}>
        {items.map((t) => (
          <div key={t.id} className={k.toast} role="status">
            <span>{t.message}</span>
            {t.action ? <button type="button" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>{t.action.label}</button> : null}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** Returns `toast(message, action?)`. Outside the provider it does nothing, so tests and stories do not crash. */
export function useToast(): ToastFn {
  return useContext(Ctx) ?? (() => {});
}
