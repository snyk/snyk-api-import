import 'source-map-support/register';
import * as url from 'url';
import {requestsManager} from 'snyk-request-manager';
import * as sleep from 'sleep-promise';
import * as debugLib from 'debug';
import * as _ from 'lodash';
import * as pMap from 'p-map';
import { PollImportResponse, Project } from '../types';
import { getApiToken } from '../get-api-token';
import { logFailedProjects } from '../../log-failed-projects';
import { logFailedPollUrls } from '../../log-failed-polls';
import { logImportedProjects } from '../../log-imported-projects';

const debug = debugLib('snyk:poll-import');
const MIN_RETRY_WAIT_TIME = 20000;
const MAX_RETRY_COUNT = 1000;

export async function pollImportUrl(
  requestManager: requestsManager,
  locationUrl: string,
  retryCount = MAX_RETRY_COUNT,
  retryWaitTime = MIN_RETRY_WAIT_TIME,
): Promise<Project[]> {
  getApiToken();
  debug(`Polling locationUrl=${locationUrl}`);
  if (!locationUrl) {
    throw new Error(
      `Missing required parameters. Please ensure you have provided: location url.
      \nFor more information see: https://snyk.docs.apiary.io/#reference/integrations/import-projects/import`,
    );
  }
  try {
    const {pathname=''} = url.parse(locationUrl);
    const res = await requestManager.request({
      verb: 'get',
      url: (pathname as string).split('/api/v1/')[1],
      body: JSON.stringify({}),
    });
    const importStatus: PollImportResponse = res.data;
    if (res.statusCode && res.statusCode !== 200) {
      throw new Error(
        'Expected a 200 response, instead received: ' +
          JSON.stringify(res.body),
      );
    }
    // TODO: use logger to show what we got
    debug(`Import task status is "${importStatus.status}"`);
    if (
      importStatus.status &&
      importStatus.status !== 'complete' &&
      retryCount > 0
    ) {
      await sleep(retryWaitTime);
      debug(`Will re-check import task in "${retryWaitTime} ms"`);
      return await pollImportUrl(requestManager, locationUrl, --retryCount);
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
  requestManager: requestsManager,
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
        const allProjects = await pollImportUrl(requestManager, locationUrl);
        const [failedProjects, projects] = _.partition(
          allProjects,
          (p: Project) => !p.success,
        );
        await logFailedProjects(locationUrl, failedProjects);
        await logImportedProjects(locationUrl, projects);
        projectsArray.push(...projects);
      } catch (error) {
        logFailedPollUrls(locationUrl, _.get(error, 'innerError.message') || error.innerError || error.message || error);
        debug('Failed to poll:', locationUrl);
      }
    },
    { concurrency: 10 },
  );

  return projectsArray;
}
