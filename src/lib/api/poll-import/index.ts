import 'source-map-support/register';
import * as url from 'url';
import type { requestsManager } from 'snyk-request-manager';
import * as sleep from 'sleep-promise';
import * as debugLib from 'debug';
import * as _ from 'lodash';
import * as pMap from 'p-map';
import type { PollImportResponse, Project } from '../../types';
import { getApiToken } from '../../get-api-token';
import type { FailedProject } from '../../../loggers/log-failed-projects';
import { logFailedProjects } from '../../../loggers/log-failed-projects';
import { logFailedPollUrls } from '../../../loggers/log-failed-polls';
import { logImportedProjects } from '../../../loggers/log-imported-projects';
import { logJobResult } from '../../../loggers/log-job-result';

const debug = debugLib('snyk:poll-import');
const MIN_RETRY_WAIT_TIME = 20000;
const MAX_RETRY_COUNT = 1000;

export async function pollImportUrl(
  requestManager: requestsManager,
  locationUrl: string,
  retryCount = MAX_RETRY_COUNT,
  retryWaitTime = MIN_RETRY_WAIT_TIME,
): Promise<{ projects: Project[] }> {
  getApiToken();
  debug(`Polling locationUrl=${locationUrl}`);
  if (!locationUrl) {
    throw new Error(
      `Missing required parameters. Please ensure you have provided: location url.
      \nFor more information see: https://snyk.docs.apiary.io/#reference/import-projects/import/import-targets`,
    );
  }
  try {
    const { pathname = '' } = url.parse(locationUrl);
    const res = await requestManager.request({
      verb: 'get',
      url: (pathname as string).split('/api/v1/')[1],
      body: JSON.stringify({}),
    });
    const importStatus: PollImportResponse = res.data;
    const statusCode = res.statusCode || res.status;

    if (!statusCode || statusCode !== 200) {
      throw new Error(
        'Expected a 200 response, instead received: ' +
          JSON.stringify({ data: res.data, status: statusCode }),
      );
    }
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
    await logJobResult(locationUrl, importStatus);
    return { projects };
  } catch (error: any) {
    console.error(
      `Could not get status update from import job: ${locationUrl}\n ERROR: ${error.message}`,
    );
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
): Promise<{ projects: Project[]; failed: FailedProject[] }> {
  if (!locationUrls) {
    throw new Error(
      'Missing required parameters. Please ensure you have provided: locationUrls.',
    );
  }
  const uniqueLocationUrls = _.uniq(locationUrls);
  const projectsArray: Project[] = [];
  const allFailedProjects: FailedProject[] = [];
  await pMap(
    uniqueLocationUrls,
    async (locationUrl) => {
      try {
        const importJobId = locationUrl.split('import/')[1];
        console.log(`Checking status for import job id: ${importJobId}`);
        const res = await pollImportUrl(requestManager, locationUrl);
        const [failedProjects, projects] = _.partition(
          res.projects,
          (p: Project) => !p.success,
        );
        console.log(
          `Discovered ${
            _.uniqBy(projects, 'projectUrl').length
          } projects from import job id: ${importJobId}${
            _.uniqBy(projects, 'projectUrl').length
              ? `. ${failedProjects.length} project(s) failed to finish importing.`
              : ''
          }`,
        );
        allFailedProjects.push(
          ...failedProjects.map((project: Project) => ({
            ...project,
            locationUrl,
          })),
        );
        await logImportedProjects(locationUrl, projects);
        projectsArray.push(...projects);
      } catch (error: any) {
        await logFailedPollUrls(locationUrl, {
          errorMessage:
            _.get(error, 'innerError.message') ||
            error.innerError ||
            error.message ||
            error,
        });
      }
    },
    { concurrency: 10 },
  );

  await logFailedProjects(allFailedProjects);

  return { projects: projectsArray, failed: allFailedProjects };
}
