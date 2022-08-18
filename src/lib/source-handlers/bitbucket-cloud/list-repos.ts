import * as debugLib from 'debug';
import base64 = require('base-64');
import { OutgoingHttpHeaders } from 'http2';
import { BitbucketCloudRepoData } from './types';
import { BitbucketCloudWorkspaceData } from './types';
import { getBitbucketCloudUsername } from './get-bitbucket-cloud-username';
import { getBitbucketCloudPassword } from './get-bitbucket-cloud-password';
import { fetchAllWorkspaces, listBitbucketCloudWorkspaces } from './list-workspaces';
import { limiterForScm } from '../../limiters';
import { limiterWithRateLimitRetries } from '../../request-with-rate-limit';

const debug = debugLib('snyk:bitbucket-cloud');

interface BitbucketReposResponse {
  values: {
    mainbranch: {
      name: string;
    };
    slug: string;
    workspace: {
      slug: string;
      uuid: string;
    };
  }[];
  next?: string;
}

// as org with project perspective mapping to SnykOrg
export const fetchAllBitbucketCloudRepos = async (
  org: string,
  workspaces: BitbucketCloudWorkspaceData[],
  username: string,
  password: string,
): Promise<BitbucketCloudRepoData[]> => {
  let lastPage = false;
  let reposList: BitbucketCloudRepoData[] = [];
  let pageCount = 1;
  let nextPage;
  while (!lastPage) {
    debug(`Fetching page ${pageCount} for ${org}\n`);
    for (const workspace of workspaces) {
      try {
        const {
          repos,
          next,
        }: { repos: BitbucketCloudRepoData[]; next?: string } = await getRepos(
          org,
          workspace.uuid,
          username,
          password,
          nextPage,
        );

        reposList = reposList.concat(repos);
        next
          ? ((lastPage = false), (nextPage = next))
          : ((lastPage = true), (nextPage = ''));
        pageCount++;
      } catch (err) {
        throw new Error(JSON.stringify(err));
      }
    }
  }
  return reposList;
};

const getRepos = async (
  org: string,
  workspace_uuid: string,
  username: string,
  password: string,
  nextPageLink?: string,
): Promise<{ repos: BitbucketCloudRepoData[]; next?: string }> => {
  const repos: BitbucketCloudRepoData[] = [];
  const headers: OutgoingHttpHeaders = {
    Authorization: `Basic ${base64.encode(username + ':' + password)}`,
  };
  const limiter = await limiterForScm(1, 1000, 1000, 1000, 1000 * 3600);
  const { statusCode, body } = await limiterWithRateLimitRetries<
    BitbucketReposResponse
  >(
    'get',
    nextPageLink ??
      `https://bitbucket.org/api/2.0/repositories/${workspace_uuid}?q=project.name="${org}"&pagelen=100`,
    headers,
    limiter,
    60000,
  );
  // will return 404 for querying a bitbucket cloud workspace uuid that does not store our orgId as its project
  // assume orgId i.e. project name is unique across workspaces
  // ideally switch to use project uuid
  if (statusCode != 200 && statusCode != 404) {
    throw new Error(`Failed to fetch projects for ${
      nextPageLink != ''
        ? nextPageLink
        : `https://bitbucket.org/api/2.0/repositories/${workspace_uuid}?q=project.name="${org}"&pagelen=100`
    }\n
      Status Code: ${statusCode}\n
      Response body: ${JSON.stringify(body)}`);
  }
  const { next, values } = body;
  for (const repo of values) {
    const { workspace, mainbranch, slug } = repo;
    if (mainbranch.name && workspace && slug)
      repos.push({
        owner: workspace.slug ? workspace.slug : repo.workspace.uuid,
        name: slug,
        branch: mainbranch.name,
      });
  }
  return { repos, next };
};

// workspace renamed as org with project perspective mapping to SnykOrg
export async function listBitbucketCloudRepos(
  org: string,
): Promise<BitbucketCloudRepoData[]> {
  const bitbucketCloudUsername = getBitbucketCloudUsername();
  const bitbucketCloudPassword = getBitbucketCloudPassword();
  const workspacesList = await fetchAllWorkspaces(bitbucketCloudUsername, bitbucketCloudPassword);
  debug(`Fetching all repos data for org: ${org}`);
  const repoList = await fetchAllBitbucketCloudRepos(
    org,
    workspacesList,
    bitbucketCloudUsername,
    bitbucketCloudPassword,
  );
  debug(`count of repos: ${repoList.length}`);
  return repoList;
}
