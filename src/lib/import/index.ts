import 'source-map-support/register';
import * as needle from 'needle';
import * as pMap from 'p-map';
import * as debugLib from 'debug';
import * as _ from 'lodash';
import { Target, FilePath, ImportTarget } from '../types';
import { getApiToken } from '../get-api-token';

const debug = debugLib('snyk:import');
const SNYK_HOST = process.env.SNYK_HOST || 'https://snyk.io';

export async function importTarget(
  orgId: string,
  integrationId: string,
  target: Target,
  files?: FilePath[],
): Promise<{ pollingUrl: string }> {
  const apiToken = getApiToken();
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
    };

    const res = await needle(
      'post',
      `${SNYK_HOST}/api/v1/org/${orgId}/integrations/${integrationId}/import`,
      body,
      {
        json: true,
        // eslint-disable-next-line @typescript-eslint/camelcase
        read_timeout: 30000,
        headers: {
          Authorization: `token ${apiToken}`,
        },
      },
    );
    if (res.statusCode && res.statusCode !== 201) {
      debug('ERROR:', res.body);
      throw new Error(
        'Expected a 201 response, instead received: ' + JSON.stringify(res.body),
      );
    }
    const locationUrl = res.headers['location'];
    if (!locationUrl) {
      throw new Error(
        'No import location url returned. Please re-try the import.',
      );
    }
    // TODO: log success
    debug(`Received locationUrl for ${target.name}: ${locationUrl}`);
    return { pollingUrl: locationUrl };
  } catch (error) {
    // TODO: log failure
    const err: {
      message?: string | undefined;
      innerError?: string;
    } = new Error('Could not complete API import');
    err.innerError = error;
    debug(`Could not complete API import: ${error}`);
    throw err;
  }
}

export async function importTargets(
  targets: ImportTarget[],
): Promise<string[]> {
  const pollingUrls: string[] = [];
  // TODO: filter out previously processed
  // TODO: validate targets
  await pMap(
    targets,
    async (t) => {
      try {
        const { orgId, integrationId, target, files } = t;
        const { pollingUrl } = await importTarget(
          orgId,
          integrationId,
          target,
          files,
        );
        // TODO: log all succeeded into a file
        pollingUrls.push(pollingUrl);
      } catch (error) {
        // TODO: log all failed into a file
        debug('Failed to process:', JSON.stringify(t));
      }
    },
    { concurrency: 5 },
  );
  return _.uniq(pollingUrls);
}
