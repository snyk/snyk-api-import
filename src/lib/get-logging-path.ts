export function getLoggingPath(): string {
  const snykLogPath = process.env.SNYK_LOG_PATH;
  if (!snykLogPath) {
    throw new Error(
      `Please set the SNYK_LOG_PATH e.g. export SNYK_LOG_PATH='~/my/path'`,
    );
  }
  // TODO: what if path is not real?
  return snykLogPath;
}
