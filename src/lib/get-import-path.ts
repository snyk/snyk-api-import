export function getImportProjectsFile(): string {
  const snykImportPath = process.env.SNYK_LOG_PATH;
  if (!snykImportPath) {
    throw new Error(
      `Please set the SNYK_IMPORT_PATH e.g. export SNYK_IMPORT_PATH='~/my/path/to/file'`,
    );
  }
  return snykImportPath;
}
