import * as fs from 'fs';
import * as path from 'path';

export function getImportProjectsFile(filePath?: string): string {
  const triedFileLocations = [];
  const snykImportPath = filePath ?? process.env.SNYK_IMPORT_PATH;
  if (!snykImportPath) {
    throw new Error(
      `Please set the SNYK_IMPORT_PATH environment variable (for example export SNYK_IMPORT_PATH='~/my/path/to/file') or set it with --file='~/my/path/to/file'`,
    );
  }

  const { ext, base } = path.parse(snykImportPath);
  const jsonFileName = ext === '.json' ? base : undefined;

  const absolutePath = jsonFileName
    ? path.resolve(process.cwd(), snykImportPath)
    : undefined;
  if (absolutePath) {
    triedFileLocations.push(absolutePath);
    // if it looks like a path to file return the path
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  // if it looks like a directory
  // assume file name
  const defaultFile = path.resolve(
    process.cwd(),
    snykImportPath,
    'import-projects.json',
  );
  triedFileLocations.push(defaultFile);
  if (fs.existsSync(defaultFile)) {
    return defaultFile;
  }

  throw new Error(
    `Could not find the import file, locations tried:${triedFileLocations.join(
      ',',
    )}. Please set the location via --file or SNYK_IMPORT_PATH e.g. export SNYK_IMPORT_PATH='~/my/path/to/import-projects.json'`,
  );
}
