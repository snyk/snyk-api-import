import { Gitlab } from '@gitbeaker/node';

import * as debugLib from 'debug';
import { fetchGitlabReposForPage } from './list-repos';
import { getBaseUrl } from './get-base-url';
import { getToken } from './get-token';

const debug = debugLib('snyk:github');

export async function gitlabGroupIsEmpty(
  groupName: string,
  host?: string,
): Promise<boolean> {
  const token = getToken();
  const baseUrl = getBaseUrl(host);
  const client = new Gitlab({ host: baseUrl, token });
  debug(`Fetching 1 page of projects data for group: ${groupName}`);
  const perPage = 1;
  const { repos } = await fetchGitlabReposForPage(client, groupName, undefined, perPage);
  if (!repos || repos.length === 0) {
    return true;
  }
  return false;
}
