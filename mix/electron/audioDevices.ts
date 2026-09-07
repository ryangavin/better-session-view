import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AudioDevice } from '../src/audioDevices.ts';
const execute = promisify(execFile);
export async function audioDevices(executable: string): Promise<AudioDevice[]> {
  const {stdout} = await execute(executable, [], {timeout:5000, maxBuffer:1024*1024});
  return JSON.parse(stdout) as AudioDevice[];
}
