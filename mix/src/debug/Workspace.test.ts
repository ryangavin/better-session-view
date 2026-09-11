// @vitest-environment happy-dom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DebugWorkspace } from './Workspace.tsx';
import type { Mix } from '../state.ts';
vi.mock('./key/KeyLab.tsx', () => ({KeyLab:() => 'Key panel fixture'}));
vi.mock('./pitch/PitchLab.tsx', () => ({PitchLab:() => 'Bass MIDI lab fixture'}));
vi.mock('./Analysis.tsx', () => ({Analysis:() => 'Beat analysis fixture'}));
vi.mock('./alignment/AlignmentLab.tsx', () => ({AlignmentLab:() => null}));
vi.mock('./waveforms/WaveformLab.tsx', () => ({WaveformLab:() => null}));
vi.mock('./render/RenderLab.tsx', () => ({RenderLab:() => null}));
afterEach(() => {cleanup(); localStorage.clear();});
it('routes to Key detection while retaining Bass pitch and existing experiments', () => {
  render(createElement(DebugWorkspace,{mix:{} as Mix,tab:'keys'}));
  expect(screen.getByRole('tab',{name:'Key detection'}).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByText('Key panel fixture')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab',{name:'Bass pitch'}));
  expect(screen.getByText('Bass MIDI lab fixture')).toBeTruthy();
  expect(screen.queryByText('Key panel fixture')).toBeNull();
  fireEvent.click(screen.getByRole('tab',{name:'Beat analysis'}));
  expect(screen.getByText('Beat analysis fixture')).toBeTruthy();
});
