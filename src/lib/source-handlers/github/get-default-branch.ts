import { Octokit } from '@octokit/rest';
import * as debugLib from 'debug';
import { getGithubToken } from './get-github-token';
import { getGithubBaseUrl } from './github-base-url';

const debug = debugLib('snyk:get-github-defaultBranch-script');

export async function getGithubReposDefaultBranch(
    RepoName: string,
    host?: string,
  ): Promise<string> {
    const githubToken = getGithubToken();
    const baseUrl = getGithubBaseUrl(host);
    const octokit: Octokit = new Octokit({ baseUrl, auth: githubToken });
    
    debug(`fetching the default branch for repo: ${RepoName}`);
    
    const response = await octokit.request(`GET /repos/${RepoName}`)

    return response.data.default_branch as string
  
  }