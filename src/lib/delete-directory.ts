import * as rmrf from 'rimraf';
import * as fs from 'fs';

export async function deleteDirectory(dir: string): Promise<void> {
  try {
    fs.rmdirSync(dir, { recursive: true, maxRetries: 3 });
  } catch (e) {
    await new Promise<void>((resolve, reject) =>
      rmrf(dir, (err) => (err ? reject(err) : resolve())),
    );
  }
}
