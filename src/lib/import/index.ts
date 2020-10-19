import 'source-map-support/register';
import * as pMap from 'p-map';
import * as debugLib from 'debug';
import { requestsManager } from 'snyk-request-manager';
import * as _ from 'lodash';
import { Target, FilePath, ImportTarget } from '../types';
import { getApiToken } from '../get-api-token';
import { getSnykHost } from '../get-snyk-host';
import { logImportedTarget } from '../../log-imported-targets';
import { getLoggingPath } from '../get-logging-path';
import { logFailedImports } from '../../log-failed-imports';
import { logImportJobsPerOrg } from '../../log-import-jobs';
import { getConcurrentImportsNumber } from '../get-concurrent-imports-number';

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

    const res = await requestManager.request({
      verb: 'post',
      url: `/org/${orgId.trim()}/integrations/${integrationId}/import`,
      body: JSON.stringify(body),
    });
    if (res.statusCode && res.statusCode !== 201) {
      throw new Error(
        'Expected a 201 response, instead received: ' +
          JSON.stringify(res.data),
      );
    }
    const locationUrl = res.headers['location'];
    if (!locationUrl) {
      throw new Error(
        'No import location url returned. Please re-try the import.',
      );
    }
    debug(`Received locationUrl for ${target.name || 'target'}: ${locationUrl}`);
    await logImportedTarget(
      orgId,
      integrationId,
      target,
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
      { errorMessage: errorBody.message, name: error.name, code: errorBody.code, requestId: error.requestId },
      loggingPath,
    );
    const err: {
      message?: string | undefined;
      innerError?: string;
    } = new Error('Could not complete API import');
    err.innerError = error;
    console.error(`Failed to kick off import for target ${JSON.stringify(target)}. ERROR: ${errorMessage}`);
    throw err;
  }
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
        await logFailedImports(orgId, integrationId, target, { errorMessage: error.message}, loggingPath);
        if (failed % concurrentImports === 0) {
          console.error(
            'Every import in this batch failed, stopping the import as this is unexpected. Please check if everything is configured correctly and try again.',
          );
          // die immediately
          return process.exit(1);
        }
      }
    },
    { concurrency: getConcurrentImportsNumber() },
  );
  return _.uniq(pollingUrls);
}
