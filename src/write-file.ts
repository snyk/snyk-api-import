import * as fs from 'fs';
import * as debugLib from 'debug';
import { getLoggingPath } from './lib';
const debug = debugLib('snyk:write-file');

export async function writeFile(
  name: string,
  content: JSON,
): Promise<string> {
  // Resolve logging path at call-time so tests can set SNYK_LOG_PATH in beforeEach
  // and mocks that replace filesystem behavior (e.g. memfs) have effect.
  const ROOT_DIR = getLoggingPath();
  const filename = `${ROOT_DIR}/${name}`;

  try {
    await fs.writeFileSync(filename, JSON.stringify(content));
    return filename;
  } catch (error: any) {
    debug(error);
    throw new Error(`Failed to write to file: ${filename}`);
  }
}
