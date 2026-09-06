import { expect, it } from 'vitest';
import { ribbonBalance, sectionRotation } from './silkVector.ts';

it('turns fully over at section boundaries, exchanging edges without a kink', () => {
  const starts = [20, 50];
  expect(sectionRotation(0, starts, 80)).toBe(0);
  expect(sectionRotation(20, starts, 80)).toBeCloseTo(Math.PI / 2);
  expect(sectionRotation(35, starts, 80)).toBeCloseTo(Math.PI);
  expect(sectionRotation(50, starts, 80)).toBeCloseTo(Math.PI * 1.5);
  expect(sectionRotation(70, starts, 80)).toBeCloseTo(Math.PI * 2);
  expect(Math.cos(sectionRotation(19, starts, 80))).toBeGreaterThan(0);
  expect(Math.cos(sectionRotation(21, starts, 80))).toBeLessThan(0);
  expect(sectionRotation(30, [], 80)).toBe(0);
});

it('exaggerates total energy differences without changing stem proportions or inventing silence', () => {
  const quiet = ribbonBalance([0.1, 0.2]), loud = ribbonBalance([0.2, 0.4]);
  expect(loud.shares).toEqual(quiet.shares);
  expect(loud.extent / quiet.extent).toBeGreaterThan(2);
  expect(ribbonBalance([0, 0])).toEqual({ extent: 0, shares: [0, 0] });
});
