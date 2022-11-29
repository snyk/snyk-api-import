import type { RepoMetaData } from '../../types';
import { getGithubToken } from './get-github-token';

export function buildGitCloneUrl(meta: RepoMetaData): string {
  const { cloneUrl } = meta;
  const url = new URL(cloneUrl);
  return `${url.protocol}//${getGithubToken()}:x-oauth-basic@${url.hostname}${
    url.pathname
  }`;
}
