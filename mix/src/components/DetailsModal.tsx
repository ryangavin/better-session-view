import { useEffect } from 'react';
import { Modal } from '@openflow/widgets/chrome/Modal.tsx';
import { Idle } from './Idle.tsx';
import type { Ready } from '../openflow.ts';
import type { Mix } from '../state.ts';
import './DetailsModal.css';

/**
 * What the track *is*, over the mixer: its name, artist, album and art, the
 * model that made its stems, and the way to make them again.
 *
 * A dialog rather than a page, because none of it needs the waveforms and all
 * of it is a moment's correction — the same form a track shows before it has
 * stems, reached from the header once it does. Pressing Separate again starts
 * the job, and the job's own screen takes over, so the dialog closes itself.
 */
export function DetailsModal({ mix, ready }: { mix: Mix; ready: Ready | null }) {
  useEffect(() => {
    if (mix.phase === 'running') mix.closeDetails();
  }, [mix.phase, mix.closeDetails]);
  if (!mix.song) return null;
  return (
    <Modal title="details" label="Track details" className="mf-details-modal" onClose={mix.closeDetails}>
      <Idle mix={mix} ready={ready} embedded />
    </Modal>
  );
}
