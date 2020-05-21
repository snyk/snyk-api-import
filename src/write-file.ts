import * as fs from 'fs';
import * as debugLib from 'debug';
const debug = debugLib('snyk:write-file');
import { getLoggingPath } from './lib/get-logging-path';

export async function writeFile(name: string, content: JSON): Promise<void> {
  const ROOT_DIR = getLoggingPath();
  const filename = `${ROOT_DIR}/${name}`;

  try {
    return await fs.writeFileSync(filename, JSON.stringify(content));
  } catch (error) {
    debug(error);
    throw new Error(`Failed to write to file: ${filename}`);
  }
}
