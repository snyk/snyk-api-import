import * as fs from 'fs';
import * as path from 'path';
import debugLib from 'debug';
const debug = debugLib('snyk:load-file');

export async function loadFile(name: string): Promise<string> {
  const filename = path.resolve(process.cwd(), name);
  try {
    return await fs.readFileSync(filename, 'utf8');
  } catch (error: any) {
    debug(error.message);
    throw new Error(`File can not be found at location: ${filename}`);
  }
}
