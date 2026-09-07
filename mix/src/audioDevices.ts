/** Read-only Core Audio capabilities; IDs remain native and never select a Web Audio sink. */
export interface RateRange { min: number; max: number }
export interface AudioDevice { name: string; isDefault: boolean; rates: RateRange[] }

/** Browser IDs are origin-scoped. Only an unambiguous exact name can identify an explicit sink. */
export function outputDevice(devices: AudioDevice[], deviceId: string, label: string): AudioDevice | null {
  const matches = devices.filter(device => deviceId ? label !== '' && device.name === label : device.isDefault);
  return matches.length === 1 ? matches[0] : null;
}
export function supportsRate(device: AudioDevice, rate: number): boolean {
  return rate === 0 || device.rates.some(range => rate >= range.min && rate <= range.max);
}
/** Preserve discrete driver values. Continuous ranges get an editable choice in the UI. */
export function rateChoices(device: AudioDevice | null): number[] {
  return [0, ...new Set(device?.rates.filter(range => range.min === range.max).map(range => range.min).sort((a,b)=>a-b) ?? [])];
}
