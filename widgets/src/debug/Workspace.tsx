import { Component, useId, useState, type ComponentType, type ReactNode } from 'react';
import './debug.css';

/** A tab owns its contents and effects. Only the selected tab is mounted. */
export interface Experiment<Context> {
  id: string;
  title: string;
  description: string;
  component: ComponentType<{ context: Context }>;
}
export interface WorkspaceProps<Context> {
  experiments: readonly Experiment<Context>[];
  context: Context;
  selected: string;
  onSelect(id: string): void;
}

class ExperimentBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  override render() {
    return this.state.error ? <div role="alert" className="wdg-experiment-error">This experiment stopped: {this.state.error}. Reset the tab to try again.</div> : this.props.children;
  }
}

/** Domain-free experiment host. Context and registration belong to the calling app. */
export function Workspace<Context>({ experiments, context, selected, onSelect }: WorkspaceProps<Context>) {
  const prefix = useId();
  const [revision, reset] = useState(0);
  const active = experiments.find((tab) => tab.id === selected) ?? experiments[0];
  if (!active) return <p>No experiments registered.</p>;
  const Content = active.component;
  return <div className="wdg wdg-workspace">
    <div className="wdg-workspace-nav">
      <div role="tablist" aria-label="Debug experiments" onKeyDown={(event) => {
        const index = experiments.indexOf(active);
        const next = event.key === 'ArrowRight' ? (index + 1) % experiments.length : event.key === 'ArrowLeft' ? (index + experiments.length - 1) % experiments.length : event.key === 'Home' ? 0 : event.key === 'End' ? experiments.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        onSelect(experiments[next].id);
        document.getElementById(`${prefix}-tab-${experiments[next].id}`)?.focus();
      }}>
        {experiments.map((tab) => <button key={tab.id} type="button" role="tab" id={`${prefix}-tab-${tab.id}`} aria-controls={`${prefix}-panel`} aria-selected={tab === active} tabIndex={tab === active ? 0 : -1} onClick={() => onSelect(tab.id)}>{tab.title}</button>)}
      </div>
      <button type="button" onClick={() => reset((n) => n + 1)}>Reset tab</button>
    </div>
    <p className="wdg-workspace-description">{active.description}</p>
    <div className="wdg-workspace-panel" role="tabpanel" id={`${prefix}-panel`} aria-labelledby={`${prefix}-tab-${active.id}`}>
      <ExperimentBoundary key={`${active.id}-${revision}`}><Content context={context} /></ExperimentBoundary>
    </div>
  </div>;
}
