/** Read-only Core Audio capabilities; IDs remain native and never select a Web Audio sink. */
export interface RateRange { min: number; max: number }
export interface AudioDevice { name: string; isDefault: boolean; rates: RateRange[] }

/**
 * Browser IDs are origin-scoped, so a device is identified by its name.
 *
 * The two sides do not spell it the same. Chrome appends the USB ids to the
 * label — `Model 16 (0644:8060)` — where Core Audio reports `Model 16`, so an
 * exact comparison fails on exactly the interfaces this is for. The suffix is
 * dropped before comparing, and the match still has to be unambiguous: naming
 * the wrong device's rates is worse than naming none.
 */
/** The name without the USB ids Chrome appends: what is written on the box. */
export const deviceLabel = (name: string) => name.replace(/\s*\(\s*[0-9a-f]{4}:[0-9a-f]{4}\s*\)\s*$/i, '').trim();
const deviceName = (name: string) => deviceLabel(name).toLowerCase();
export function outputDevice(devices: AudioDevice[], deviceId: string, label: string): AudioDevice | null {
  const wanted = deviceName(label);
  const matches = devices.filter(device => deviceId ? wanted !== '' && deviceName(device.name) === wanted : device.isDefault);
  return matches.length === 1 ? matches[0] : null;
}
export function supportsRate(device: AudioDevice, rate: number): boolean {
  return rate === 0 || device.rates.some(range => rate >= range.min && rate <= range.max);
}
/** Preserve discrete driver values. Continuous ranges get an editable choice in the UI. */
export function rateChoices(device: AudioDevice | null): number[] {
  return [0, ...new Set(device?.rates.filter(range => range.min === range.max).map(range => range.min).sort((a,b)=>a-b) ?? [])];
}
