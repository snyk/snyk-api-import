import 'source-map-support/register';
import * as pMap from 'p-map';
import * as path from 'path';
import * as debugLib from 'debug';
import type { requestsManager } from 'snyk-request-manager';
import * as _ from 'lodash';
import type { Target, FilePath, ImportTarget } from '../../types';
import { getApiToken } from '../../get-api-token';
import { getSnykHost } from '../../get-snyk-host';
import { logImportedTargets } from '../../../loggers/log-imported-targets';
import { getLoggingPath } from '../../get-logging-path';
import { logFailedImports } from '../../../loggers/log-failed-imports';
import { logImportJobsPerOrg } from '../../../loggers/log-import-jobs';
import { getConcurrentImportsNumber } from '../../get-concurrent-imports-number';
import { FAILED_LOG_NAME, targetProps } from '../../../common';
import { requestWithRateLimitHandling } from './request-with-rate-limit';

const debug = debugLib('snyk:api-import');

export async function importTarget(
  requestManager: requestsManager,
  orgId: string,
  integrationId: string,
  target: Target,
  files?: FilePath[] | undefined,
  exclusionGlobs?: string | undefined,
  loggingPath?: string,
): Promise<{
  pollingUrl: string;
  target: Target;
  orgId: string;
  integrationId: string;
}> {
  const logPath = loggingPath || getLoggingPath();
  getApiToken();
  debug('Importing:', JSON.stringify({ orgId, integrationId, target }));

  if (!orgId || !integrationId || Object.keys(target).length === 0) {
    throw new Error(
      `Missing required parameters. Please ensure you have set: orgId, integrationId, target.
      \nFor more information see: https://snyk.docs.apiary.io/#reference/import-projects/import/import-targets`,
    );
  }
  try {
    const body = {
      target: isGitlabTarget(target)
        ? _.pick(target, 'id', 'branch')
        : _.pick(target, ...targetProps),
      files,
      exclusionGlobs,
    };
    getSnykHost();

    const res = await requestWithRateLimitHandling(
      requestManager,
      `/org/${orgId.trim()}/integrations/${integrationId}/import`,
      'post',
      body,
    );

    const statusCode = res.statusCode || res.status;
    if (!statusCode || statusCode !== 201) {
      throw new Error(
        'Expected a 201 response, instead received: ' +
          JSON.stringify({ data: res.data, statusCode: res.statusCode }),
      );
    }
    const locationUrl = res.headers?.['location'];
    if (!locationUrl) {
      throw new Error(
        'No import location url returned. Please re-try the import.',
      );
    }
    debug(
      `Received locationUrl for ${target.name || 'target'}: ${locationUrl}`,
    );
    await logImportedTargets(
      [{ target, integrationId, orgId }],
      locationUrl,
      loggingPath,
    );
    return {
      pollingUrl: locationUrl,
      integrationId,
      target,
      orgId,
    };
  } catch (error: any) {
    const errorBody = error.data || error;
    const errorMessage = errorBody.message;
    const err: {
      message?: string | undefined;
      innerError?: string;
    } = new Error('Could not complete API import');
    err.innerError = error;
    console.error(
      `Failed to kick off import for target: ${JSON.stringify(
        target,
      )}.\nERROR name: ${
        error.name
      } msg: ${errorMessage} See more information in logs located at ${path.join(
        logPath,
        orgId,
      )}.${FAILED_LOG_NAME} or re-start in DEBUG mode.`,
    );
    throw err;
  }
}

let failedMoreThanOnce = false;
let ignoreMultipleFails = false;
export async function importTargets(
  requestManager: requestsManager,
  targets: ImportTarget[],
  loggingPath = getLoggingPath(),
): Promise<string[]> {
  const pollingUrls: string[] = [];
  let failed = 0;
  const concurrentImports = getConcurrentImportsNumber();
  await pMap(
    targets,
    async (t) => {
      try {
        const { orgId, integrationId, target, files, exclusionGlobs } = t;
        const { pollingUrl } = await importTarget(
          requestManager,
          orgId,
          integrationId,
          target,
          files,
          exclusionGlobs,
          loggingPath,
        );
        await logImportJobsPerOrg(orgId, pollingUrl);
        pollingUrls.push(pollingUrl);
      } catch (error: any) {
        failed++;
        const { orgId, integrationId, target } = t;
        await logFailedImports(
          orgId,
          integrationId,
          target,
          { errorMessage: error.message, innerError: error.innerError },
          loggingPath,
        );

        if (!ignoreMultipleFails && failed % concurrentImports === 0) {
          if (failedMoreThanOnce) {
            console.error(
              `Every import in the last few batches failed, stopping as this is unexpected! Please check if everything is configured ok and review the logs located at ${loggingPath}/*.`,
            );
            var rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.question("Do you want to continue anyway? (Y / N)", function(answer) {
              answer = answer.toUpperCase();
              if(!(answer === "Y")){
                process.exit(1);
              }
            });
            ignoreMultipleFails = true;
          }
          failedMoreThanOnce = true;
        }
      }
    },
    { concurrency: getConcurrentImportsNumber() },
  );
  return _.uniq(pollingUrls);
}

function isGitlabTarget(target: Target): boolean {
  const keys = Object.keys(target);
  if (keys.find((k) => k === 'id') && keys.find((k) => k === 'branch')) {
    return true;
  }

  return false;
}
