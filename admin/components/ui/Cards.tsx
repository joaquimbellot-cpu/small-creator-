// Card view helpers (server-safe). The look is the app's .tile with a grid of cards around it.
//   <CardGrid>
//     <Card>
//       <div className="toolbar"><Badge>New</Badge><span className={cardRaiseClass}><Checkbox aria-label="Select Ada" /></span></div>
//       <h3 className={cardTitleClass}><Link href="?open=5" className={cardLinkClass}>Ada Example</Link></h3>
//       <KeyValue label="Subscribers">12,400</KeyValue>
//     </Card>
//   </CardGrid>
// The title link covers the whole card (click anywhere opens it). Wrap other controls in cardRaiseClass so they stay clickable.
import type { ReactNode } from 'react';
import k from './kit.module.css';

export const cardLinkClass = k.cardLink;
export const cardTitleClass = k.cardTitle;
export const cardRaiseClass = k.cardRaise;

export function CardGrid({ children, label }: { children: ReactNode; label?: string }) {
  return <div className={k.cards} role="list" aria-label={label}>{children}</div>;
}

export function Card({ children }: { children: ReactNode }) {
  return <article className={`tile ${k.card}`} role="listitem">{children}</article>;
}

/** A label on the left, a value on the right: `Subscribers ........ 12,400`. */
export function KeyValue({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <div className={k.kv}><span>{label}</span><span>{children}</span></div>;
}
