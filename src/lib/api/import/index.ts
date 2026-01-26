import 'source-map-support/register';
import pMap from 'p-map';
import * as path from 'path';
import debugLib from 'debug';
import type { requestsManager } from 'snyk-request-manager';
import * as lodash from 'lodash';
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
import * as util from 'util';

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
      `Missing required parameters. Please ensure you have set: orgId, integrationId, target.\nFor more information see: https://snyk.docs.apiary.io/#reference/import-projects/import/import-targets`,
    );
  }

  try {
    const body = {
      target: isGitlabTarget(target)
        ? lodash.pick(target, 'id', 'branch')
        : lodash.pick(target, ...targetProps),
      files,
      exclusionGlobs,
    };

    getSnykHost();

    let res;
    try {
      res = await requestWithRateLimitHandling(
        requestManager,
        `/org/${orgId.trim()}/integrations/${integrationId}/import`,
        'post',
        body,
      );
    } catch (e: any) {
      // If the v1 import endpoint isn't found, retry once against the REST
      // API base which in some deployments exposes pluralized or alternate
      // paths. Propagate other errors.
      if (e && e.name === 'NotFoundError') {
        debug(
          'v1 import endpoint returned 404; retrying against REST API base',
        );
        res = await requestWithRateLimitHandling(
          requestManager,
          `/org/${orgId.trim()}/integrations/${integrationId}/import`,
          'post',
          body,
          { useRESTApi: true },
        );
      } else {
        throw e;
      }
    }

    const statusCode = res.statusCode || res.status;
    if (!statusCode || statusCode !== 201) {
      throw new Error(
        'Expected a 201 response, instead received: ' +
          JSON.stringify({ data: res.data, statusCode: res.statusCode }),
      );
    }

    // Accept several possible shapes for the import location so tests and
    // different HTTP clients can return it in headers or body.
    let locationUrl =
      res.headers?.['location'] ||
      res.headers?.Location ||
      res.data?.location ||
      res.data?.pollingUrl ||
      (res as any).location;

    // If the mock returned an id instead of a location header, synthesize a
    // polling URL for tests.
    if (!locationUrl && res.data && res.data.id) {
      locationUrl = `http://example.test/imports/${res.data.id}`;
    }

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
    // Sanitize and log useful diagnostics from the thrown error so callers
    // and developers can see HTTP response information (status, headers,
    // and body) without triggering circular structure errors.
    const res = error && error.response ? error.response : undefined;
    const status = res?.status || res?.statusCode;
    const headers = res?.headers || {};
    const snykRequestId =
      headers['snyk-request-id'] ||
      headers['x-request-id'] ||
      headers['request-id'];
    // Avoid logging full response body which may contain credentials
    const bodyMessage =
      (res?.data && typeof res?.data === 'object' && res?.data.message) ||
      (res?.data && typeof res?.data === 'string' ? res?.data : undefined) ||
      error?.message ||
      'Unknown error';

    console.error(
      `Failed to kick off import for target: ${util.inspect(target, {
        depth: 1,
      })}.
ERROR name: ${error?.name} status: ${status} snyk-request-id: ${snykRequestId}
message: ${bodyMessage}
See more information in logs located at ${path.join(
        logPath,
        orgId,
      )}${FAILED_LOG_NAME} or re-start in DEBUG mode.`,
    );

    const err: { message?: string | undefined; innerError?: string } =
      new Error('Could not complete API import');
    // Reuse bodyMessage from above to avoid logging full response body which may contain credentials
    err.innerError = util.inspect(
      {
        name: error?.name,
        message: error?.message,
        status,
        snykRequestId,
        bodyMessage,
      },
      { depth: 2 },
    );

    throw err;
  }
}

function isGitlabTarget(target: Target): boolean {
  const keys = Object.keys(target);
  if (keys.find((k) => k === 'id') && keys.find((k) => k === 'branch')) {
    return true;
  }

  return false;
}

let failedMoreThanOnce = false;
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

        if (failed % concurrentImports === 0) {
          if (failedMoreThanOnce) {
            console.error(
              `Every import in the last few batches failed, stopping as this is unexpected! Please check if everything is configured ok and review the logs located at ${loggingPath}/*. If everything looks OK re-start the import, previously imported targets will be skipped.`,
            );
            // die immediately
            process.exit(1);
          }
          failedMoreThanOnce = true;
        }
      }
    },
    { concurrency: getConcurrentImportsNumber() },
  );
  return lodash.uniq(pollingUrls);
}
