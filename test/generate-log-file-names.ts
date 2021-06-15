import * as path from 'path';

import {
  IMPORT_LOG_NAME,
  FAILED_LOG_NAME,
  FAILED_PROJECTS_LOG_NAME,
  IMPORT_JOBS_LOG_NAME,
  IMPORTED_PROJECTS_LOG_NAME,
  IMPORT_JOB_RESULTS,
} from '../src/common';

export function generateLogsPaths(
  logPath: string,
  orgId: string,
): {
  importLogPath: string;
  failedImportLogPath: string;
  failedProjectsLogPath: string;
  importJobIdsLogsPath: string;
  importedProjectsLogPath: string;
  importJobsLogPath: string;
} {
  process.env.SNYK_LOG_PATH = logPath;
  const importLogPath = path.resolve(logPath, IMPORT_LOG_NAME);
  const failedImportLogPath = path.resolve(
    logPath,
    `${orgId}.${FAILED_LOG_NAME}`,
  );
  const failedProjectsLogPath = path.resolve(
    logPath,
    `${orgId}.${FAILED_PROJECTS_LOG_NAME}`,
  );
  const importJobIdsLogsPath = path.resolve(
    logPath,
    `${orgId}.${IMPORT_JOBS_LOG_NAME}`,
  );
  const importedProjectsLogPath = path.resolve(
    logPath,
    `${orgId}.${IMPORTED_PROJECTS_LOG_NAME}`,
  );
  const importJobsLogPath = path.resolve(logPath, IMPORT_JOB_RESULTS);
  return {
    importLogPath,
    failedImportLogPath,
    failedProjectsLogPath,
    importJobIdsLogsPath,
    importedProjectsLogPath,
    importJobsLogPath,
  };
}
