import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function getLoggingPath(): string {
  const snykLogPath = process.env.SNYK_LOG_PATH;
  if (!snykLogPath) {
    throw new Error(
      `Please set the SNYK_LOG_PATH e.g. export SNYK_LOG_PATH='~/my/path'`,
    );
  }
  // Expand leading ~ to the user's home dir
  const expanded = snykLogPath.startsWith('~')
    ? path.join(os.homedir(), snykLogPath.slice(1))
    : snykLogPath;

  // Resolve to an absolute path and remove any trailing slashes/backslashes
  const resolved = path.resolve(expanded);
  const normalized = resolved.replace(/[\\/]+$/, '');

  if (!fs.existsSync(normalized)) {
    try {
      // Create directories recursively to support in-memory filesystems used in tests
      // (e.g., memfs) and to avoid errors when parent directories are missing.
      fs.mkdirSync(normalized, { recursive: true } as any);
    } catch {
      throw new Error(
        `Failed to auto create the path ${normalized} provided in the SNYK_LOG_PATH. Please check this variable is set correctly`,
      );
    }
  }

  return normalized;
}
