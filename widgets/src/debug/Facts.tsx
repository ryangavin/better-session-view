import type { ReactNode } from 'react';
import './debug.css';

/**
 * Names and values, read at a glance.
 *
 * The summary a harness opens with: the tempo found, how many beats, the
 * agreement, the latency. A fact is a name and a value and, when it matters,
 * a tone — good, bad, or quiet for the ones that only exist for completeness.
 */
export interface Fact {
  name: string;
  value: ReactNode;
  tone?: 'normal' | 'good' | 'bad' | 'quiet';
  title?: string;
}

export interface FactsProps {
  items: readonly Fact[];
  className?: string;
}

export function Facts({ items, className }: FactsProps) {
  return (
    <dl className={`wdg wdg-facts${className ? ` ${className}` : ''}`}>
      {items.map((fact) => (
        <div key={fact.name} className="wdg-fact" data-tone={fact.tone ?? 'normal'} title={fact.title}>
          <dt>{fact.name}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
