export const IMPORT_LOG_NAME = 'imported-targets.log';
export const FAILED_LOG_NAME = 'failed-imports.log';
export const FAILED_PROJECTS_LOG_NAME = 'failed-projects.log';
export const FAILED_POLLS_LOG_NAME = 'failed-polls.log';
export const IMPORT_JOBS_LOG_NAME = 'import-jobs.log';
export const IMPORTED_PROJECTS_LOG_NAME = 'imported-projects.log';
export const IMPORTED_BATCHES_LOG_NAME = 'imported-batches.log';
export const IMPORT_JOB_RESULTS = 'import-job-results.log';
export const CREATED_ORG_LOG_NAME = 'created-orgs.log'
export const FAILED_ORG_LOG_NAME = 'failed-to-create-orgs.log'
export const targetProps = [
  'name',
  'appId',
  'functionId',
  'slugId',
  'projectKey',
  'repoSlug',
  // 'id', skip Gitlab ID so we can match against Snyk project data where ID is never returned by Snyk APIs
  'owner',
  'branch',
];
export const targetPropsWithId = [...targetProps, 'id'];

export const UPDATED_BATCHES_LOG_NAME = 'updated-batches.log';