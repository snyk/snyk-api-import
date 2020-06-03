import * as path from 'path';

import {
  IMPORT_LOG_NAME,
  FAILED_LOG_NAME,
  FAILED_PROJECTS_LOG_NAME,
} from '../src/common';

export function generateLogsPaths(
  logPath: string,
): {
  importLogPath: string;
  failedImportLogPath: string;
  failedProjectsLogPath: string;
} {
  process.env.SNYK_LOG_PATH = logPath;
  const importLogPath = path.resolve(logPath, `${IMPORT_LOG_NAME}`);
  const failedImportLogPath = path.resolve(logPath, `${FAILED_LOG_NAME}`);
  const failedProjectsLogPath = path.resolve(logPath, FAILED_PROJECTS_LOG_NAME);

  return {
    importLogPath,
    failedImportLogPath,
    failedProjectsLogPath,
  };
}
