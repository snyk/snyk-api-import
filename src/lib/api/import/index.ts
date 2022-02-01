import 'source-map-support/register';
import * as pMap from 'p-map';
import * as path from 'path';
import * as debugLib from 'debug';
import { requestsManager } from 'snyk-request-manager';
import * as _ from 'lodash';
import { Target, FilePath, ImportTarget } from '../../types';
import { getApiToken } from '../../get-api-token';
import { getSnykHost } from '../../get-snyk-host';
import { logImportedTargets } from '../../../loggers/log-imported-targets';
import { getLoggingPath } from '../../get-logging-path';
import { logFailedImports } from '../../../loggers/log-failed-imports';
import { logImportJobsPerOrg } from '../../../loggers/log-import-jobs';
import { getConcurrentImportsNumber } from '../../get-concurrent-imports-number';
import { FAILED_LOG_NAME } from '../../../common';

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
      \nFor more information see: https://snyk.docs.apiary.io/#reference/integrations/import-projects/import`,
    );
  }
  try {
    const body = {
      target,
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
          JSON.stringify({ data: res.data, statusCode: res.statusCode}),
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
  } catch (error) {
    const errorBody = error.data || error;
    const errorMessage = errorBody.message;
    await logFailedImports(
      orgId,
      integrationId,
      target,
      {
        errorMessage: errorBody.message,
        name: error.name,
        code: errorBody.code,
        requestId: error.requestId,
      },
      loggingPath,
    );
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

async function requestWithRateLimitHandling(
  requestManager: requestsManager,
  url: string,
  verb: string,
  body = {},
): Promise<any> {
  const maxRetries = 7;
  let attempt = 0;
  let res;
  debug('Requesting import with retry');

  while (attempt < maxRetries) {
    try {
      res = await requestManager.request({
        verb,
        url,
        body: JSON.stringify(body),
      });
      break;
    } catch (e) {
      res = e;
      if (e.data.code === 401) {
        console.error(`ERROR: ${e.data.message}. Please check the token and try again.`)
        break;
      }
      if (e.data.code === 404) {
        break;
      }
      attempt += 1;
      debug('Failed:' + JSON.stringify(e));
      if (e.data.code === 429) {
        const sleepTime = 600_000 * attempt; // 10 mins x attempt with a max of ~ 1hr
        console.error(
          `Received a rate limit error, sleeping for ${sleepTime} ms (attempt # ${attempt})`,
        );
        await new Promise((r) => setTimeout(r, sleepTime));
      }
    }
  }

  return res;
}

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
      } catch (error) {
        failed++;
        const { orgId, integrationId, target } = t;
        await logFailedImports(
          orgId,
          integrationId,
          target,
          { errorMessage: error.message },
          loggingPath,
        );
        if (failed % concurrentImports === 0) {
          console.error(
            `Every import in this batch failed, stopping as this is unexpected! Please check if everything is configured ok and review the logs located at ${loggingPath}/*. If everything looks OK re-start the import, previously imported targets will be skipped.`,
          );
          // die immediately
          process.exit(1);
        }
      }
    },
    { concurrency: getConcurrentImportsNumber() },
  );
  return _.uniq(pollingUrls);
}
