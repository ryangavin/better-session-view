import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Modal } from '@openflow/widgets/chrome/Modal.tsx';
import { DebugWorkspace } from '../debug/Workspace.tsx';
import type { Mix } from '../state.ts';
import './DebugButton.css';

/** A bug: the analysis harness, which is a debugging page and says so. */
const bugMark = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="8" y="8" width="8" height="11" rx="4" />
    <path d="M10 8V6.5a2 2 0 0 1 4 0V8M4 13h4M16 13h4M5 19l3-2M19 19l-3-2M5 8l3 2M19 8l-3 2" />
  </svg>
);


/** The bug joins Settings in the header; its full-size workspace is hosted by App. */
export function DebugButton({ mix }: { mix: Mix }) {
  return <Button width={26} className="mf-header-icon" disabled={!mix.song} onPress={() => mix.openDebug()} title="Debug & experiments" label="Open debug workspace">{bugMark}</Button>;
}

export function DebugModal({ mix }: { mix: Mix }) {
  return mix.debugTab !== null && mix.song ? <Modal title="debug & experiments" label="Debug workspace" className="mf-harness" onClose={mix.closeDebug}><DebugWorkspace mix={mix} tab={mix.debugTab || undefined} /></Modal> : null;
}
