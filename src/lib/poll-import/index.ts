import 'source-map-support/register';
import * as needle from 'needle';
import * as sleep from 'sleep-promise';
import * as debugLib from 'debug';
import * as _ from 'lodash';
import * as pMap from 'p-map';
import { PollImportResponse, Project } from '../types';
import { getApiToken } from '../get-api-token';
import { logFailedProjects } from '../../log-failed-projects';
import { logFailedPollUrls } from '../../log-failed-polls';

const debug = debugLib('snyk:poll-import');
const MIN_RETRY_WAIT_TIME = 30000;
const MAX_RETRY_COUNT = 1000;

export async function pollImportUrl(
  locationUrl: string,
  retryCount = MAX_RETRY_COUNT,
  retryWaitTime = MIN_RETRY_WAIT_TIME,
): Promise<Project[]> {
  const apiToken = getApiToken();
  debug(`Polling locationUrl=${locationUrl}`);
  if (!locationUrl) {
    throw new Error(
      `Missing required parameters. Please ensure you have provided: location url.
      \nFor more information see: https://snyk.docs.apiary.io/#reference/integrations/import-projects/import`,
    );
  }
  try {
    const res = await needle('get', `${locationUrl}`, {
      json: true,
      // eslint-disable-next-line @typescript-eslint/camelcase
      read_timeout: 30000,
      headers: {
        Authorization: `token ${apiToken}`,
      },
    });
    const importStatus: PollImportResponse = res.body;
    debug(`Import task status is "${importStatus.status}"`);
    if (
      importStatus.status &&
      importStatus.status !== 'complete' &&
      retryCount > 0
    ) {
      await sleep(retryWaitTime);
      debug(`Will re-check import task in "${retryWaitTime} ms"`);
      return await pollImportUrl(
        locationUrl,
        --retryCount,
      );
    }
    const projects: Project[] = [];
    importStatus.logs.forEach((log) => {
      projects.push(...log.projects);
    });
    return projects;
  } catch (error) {
    debug('Could not poll Url:', locationUrl, error.message);
    const err: {
      message?: string | undefined;
      innerError?: string;
    } = new Error('Could not poll Url');
    err.innerError = error;
    throw err;
  }
}

export async function pollImportUrls(
  locationUrls: string[],
): Promise<Project[]> {
  if (!locationUrls) {
    throw new Error(
      'Missing required parameters. Please ensure you have provided: locationUrls.',
    );
  }
  const uniqueLocationUrls = _.uniq(locationUrls);
  const projectsArray: Project[] = [];
  await pMap(
    uniqueLocationUrls,
    async (locationUrl) => {
      try {
        const allProjects = await pollImportUrl(locationUrl);
        const [failedProjects, projects] = _.partition(
          allProjects,
          (p: Project) => !p.success,
        );
        logFailedProjects(locationUrl, failedProjects);
        projectsArray.push(...projects);
      } catch (error) {
        logFailedPollUrls(locationUrl, error.message || error);
        debug('Failed to poll:', locationUrl);
      }
    },
    { concurrency: 10 },
  );

  return projectsArray;
}
