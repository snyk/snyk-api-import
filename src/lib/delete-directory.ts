import { rimraf as rmrf } from 'rimraf';
import * as fs from 'fs';

export async function deleteDirectory(dir: string): Promise<void> {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    await rmrf(dir);
  }
}
