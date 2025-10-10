import * as fs from 'fs';

export function getLoggingPath(): string {
  const snykLogPath = process.env.SNYK_LOG_PATH;
  if (!snykLogPath) {
    throw new Error(
      `Please set the SNYK_LOG_PATH e.g. export SNYK_LOG_PATH='~/my/path'`,
    );
  }
  if (!fs.existsSync(snykLogPath)) {
    try {
      // Create directories recursively to support in-memory filesystems used in tests
      // (e.g., memfs) and to avoid errors when parent directories are missing.
      fs.mkdirSync(snykLogPath, { recursive: true } as any);
    } catch (e) {
      throw new Error(
        `Failed to auto create the path ${snykLogPath} provided in the SNYK_LOG_PATH. Please check this variable is set correctly`,
      );
    }
  }
  return snykLogPath;
}
