import 'source-map-support/register';
import * as needle from 'needle';
import * as sleep from 'sleep-promise';
import { Url } from 'url';
import * as pMap from 'p-map';

interface Target {
  name?: string; // Gitlab, GitHub, GH Enterprise, Bitbucket Cloud and Azure Repos, Bitbucket Server, Azure Container Registry, Elastic Container Registry, Artifactory Container Registry, Docker Hub
  appId?: string; // Heroku, CloudFoundry, Pivotal & IBM Cloud
  functionId?: string; // AWS Labmda
  slugId?: string; // Heroku
  projectKey?: string; // Bitbucket Server
  repoSlug?: string; // Bitbucket Server
  id?: number; // Gitlab
  owner: string; // Gitlab, GitHub, GH Enterprise, Bitbucket Cloud and Azure Repos
  branch: string; // Gitlab, GitHub, GH Enterprise, Bitbucket Cloud and Azure Repos
}

interface FilePath {
  path: string;
}
const SNYK_HOST = 'https://dev.snyk.io';
const MIN_RETRY_WAIT_TIME = 30000;
const MAX_RETRY_COUNT = 1000;

export async function importTarget(
  orgId: string,
  integrationId: string,
  target: Target,
  files?: FilePath[],
): Promise<{ pollingUrl: string }> {
  const apiToken = process.env.SNYK_API_TOKEN;
  if (!apiToken) {
    throw new Error(
      `Please set the SNYK_API_TOKEN e.g. export SNYK_API_TOKEN='*****'`,
    );
  }
  console.log('Importing target:', { orgId, integrationId, target });

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
    const pollingUrl = res.headers['location'];
    if (!pollingUrl) {
      throw new Error(
        'No import location url returned. Please re-try the import.',
      );
    }
    // TODO: log any failed projects for re-processing later
    console.log(`pollingUrl for ${target.name}: ${pollingUrl}`);
    return { pollingUrl };
  } catch (error) {
    const err: {
      message?: string | undefined;
      innerError?: string;
    } = new Error('Could not complete API import');
    err.innerError = error;
    throw err;
  }
}

interface ImportTarget {
  orgId: string;
  integrationId: string;
  target: Target;
  files?: FilePath[];
}

export async function importTargets(
  targets: ImportTarget[],
): Promise<string[]> {
  const apiToken = process.env.SNYK_API_TOKEN;
  if (!apiToken) {
    throw new Error(
      `Please set the SNYK_API_TOKEN e.g. export SNYK_API_TOKEN='*****'`,
    );
  }
  const pollingUrls: string[] = [];
  // TODO: filter out previously processed

  await pMap(
    targets,
    async (t) => {
      try {
        const { orgId, integrationId, target, files } = t;
        const {pollingUrl} = await importTarget(orgId, integrationId, target, files);
        // TODO: log all succeeded into a file

        pollingUrls.push(pollingUrl);
      } catch (error) {
        // TODO: log all failed into a file
        console.log('Failed to process:', JSON.stringify(t));
      }
    },
    { concurrency: 5 },
  );
  return pollingUrls;
}

interface Status {
  status: 'pending' | 'failed' | 'complete';
}

interface Project {
  targetFile?: string;
  success: boolean;
  projectUrl: Url;
}

interface Log {
  name: string;
  created: string;
  status: Status;
  projects: Project[];
}

interface PollImportResponse {
  id: string;
  status: 'pending' | 'failed' | 'complete';
  created: string;
  logs: Log[];
}

export async function pollImportUrl(
  locationUrl: string,
  retryCount = MAX_RETRY_COUNT,
  retryWaitTime = MIN_RETRY_WAIT_TIME,
): Promise<PollImportResponse> {
  const apiToken = process.env.SNYK_API_TOKEN;
  // const apiToken = process.env.SNYK_API_TOKEN_LOCAL;

  if (!apiToken) {
    throw new Error(
      `Please set the SNYK_API_TOKEN e.g. export SNYK_API_TOKEN='*****'`,
    );
  }

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
    console.log(`Import task status is |${importStatus.status}|`);
    if (
      importStatus.status &&
      importStatus.status !== 'complete' &&
      retryCount > 0
    ) {
      await sleep(retryWaitTime);
      const increasedRetryWaitTime =
        retryWaitTime + retryWaitTime * 0.1 * (MAX_RETRY_COUNT - retryCount);
      console.log(
        `Will re-check import task in |${increasedRetryWaitTime}| ms`,
      );
      return await pollImportUrl(
        locationUrl,
        --retryCount,
        increasedRetryWaitTime,
      );
    }
    return res.body;
  } catch (error) {
    console.log('Could not complete API import:', error);
    const err: {
      message?: string | undefined;
      innerError?: string;
    } = new Error('Could not complete API import');
    err.innerError = error;
    throw err;
  }
}
