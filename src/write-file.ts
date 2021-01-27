import * as fs from 'fs';
import * as debugLib from 'debug';
import { getLoggingPath } from './lib/get-logging-path';
const debug = debugLib('snyk:write-file');

export async function writeFile(
  name: string,
  content: JSON,
): Promise<string> {
  const ROOT_DIR = getLoggingPath();
  const filename = `${ROOT_DIR}/${name}`;

  try {
    await fs.writeFileSync(filename, JSON.stringify(content));
    return filename;
  } catch (error) {
    debug(error);
    throw new Error(`Failed to write to file: ${filename}`);
  }
}
