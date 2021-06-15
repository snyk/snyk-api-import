import 'source-map-support/register';
import * as pMap from 'p-map';
import * as path from 'path';
import * as debugLib from 'debug';
import { requestsManager } from 'snyk-request-manager';
import * as _ from 'lodash';
import { Target, ImportTarget } from '../../types';
import { getApiToken } from '../../get-api-token';
import { getSnykHost } from '../../get-snyk-host';
import { getMaxBulkImport } from '../../get-max-bulk-import'
import { logImportedTargets } from '../../../loggers/log-imported-targets';
import { getLoggingPath } from '../../get-logging-path';
import { logFailedImports } from '../../../loggers/log-failed-imports';
import { logImportedBatch } from '../../../loggers/log-imported-batch';
import { logImportJobsPerOrg } from '../../../loggers/log-import-jobs';
import { getConcurrentImportsNumber } from '../../get-concurrent-imports-number';
import { FAILED_LOG_NAME } from '../../../common';

const debug = debugLib('snyk:api-import');

export async function importBulk(
  requestManager: requestsManager,
  orgId: string,
  integrationId: string,
  targets: ImportTarget[],
  loggingPath?: string,
): Promise<{
  pollingUrl: string;
  targets: Target[];
  orgId: string;
  integrationId: string;
}> {
  const logPath = loggingPath || getLoggingPath();
  getApiToken();
  debug('Importing:', JSON.stringify({ orgId, integrationId, targets }));

  if (!orgId || !integrationId || targets.length === 0) {
    throw new Error(
      `Missing required parameters. Please ensure you have set: orgId, integrationId, target.
      \nFor more information see: https://snyk.docs.apiary.io/#reference/integrations/import-projects/import`,
    );
  }
  try {

    getSnykHost();

    const res = await requestManager.request({
      verb: 'post',
      url: `org/${orgId.trim()}/integrations/${integrationId}/bulk-import`,
      body: JSON.stringify({
        import: targets
      }),
    });
    if (res.status && res.status !== 201) {
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
    debug(
      `Received locationUrl for org ${orgId}, integration ${integrationId}: ${locationUrl}`);
    await logImportedTargets(
      targets,
      locationUrl,
      loggingPath,
    );
    return {
      pollingUrl: locationUrl,
      integrationId,
      targets: targets.map(t => t.target),
      orgId,
    };
  } catch (error) {
    const errorBody = error.data || error;
    const errorMessage = errorBody.message;

    logFailedImports(
      orgId,
      integrationId,
      targets.map(t => t.target),
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
      `Failed to kick off import for targets: ${JSON.stringify(
        targets,
      )}.\nERROR name: ${
        error.name
      } msg: ${errorMessage}. See more information in logs located at ${path.join(
        logPath,
        orgId,
      )}.${FAILED_LOG_NAME} or re-start in DEBUG mode.`,
    );
    throw err;
  }
}

export function groupByOrgAndIntegration(
  targets : ImportTarget[],
  maxPerBulk: number)  : {[key: string]: ImportTarget[]} {
  let initialValue : {[key: string]: ImportTarget[]} = {}

  let byOrgAndIntegration = targets.reduce((p, c) => {
    var index = 1;
    var key = ''

    do {
      key = `${c.orgId}#${c.integrationId}#${index}`

      if (!p.hasOwnProperty(key)) {
        p[key] = []
        break
      } 
      else if (p[key].length < maxPerBulk) {
        break
      } else {
        index++
      }
    } while (true)

    p[key].push(c)

    return p;

  }, initialValue)

  return initialValue;
}

export async function importTargets(
  requestManager: requestsManager,
  targets: ImportTarget[],
  loggingPath = getLoggingPath(),
): Promise<string[]> {
  let byOrgAndIntegration = groupByOrgAndIntegration(targets, getMaxBulkImport())
  const pollingUrls: string[] = [];
  let failed = 0;
  const concurrentImports = getConcurrentImportsNumber();
  await pMap(
    Object.keys(byOrgAndIntegration),
    async (key) => {
      try {

        let toImport = byOrgAndIntegration[key]
        let [orgId, integrationId, batchId] = key.split("#")
        const { pollingUrl } = await importBulk(
          requestManager,
          orgId,
          integrationId,
          toImport,
          loggingPath,
        );
        await logImportJobsPerOrg(orgId, pollingUrl);
        pollingUrls.push(pollingUrl);
      } catch (error) {
        failed++;
        let [orgId, integrationId] = key.split("#")
        logFailedImports(
          orgId,
          integrationId,
          targets.map(t => t.target),
          { errorMessage: error.message },
          loggingPath,
        );
        
        if (failed % concurrentImports === 0) {
          console.error(
            `Every import in this batch failed, stopping as this is unexpected! Please check if everything is configured ok and review the logs located at ${loggingPath}/*. If everything looks OK re-start the import, previously imported targets will be skipped.`,
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