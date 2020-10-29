import { Octokit } from '@octokit/rest';
import { getGithubBaseUrl } from './github-base-url';

interface RepoData {
  fork: boolean;
  branch: string;
  owner: string;
  name: string;
}
export async function listGithubRepos(orgName: string, host?: string): Promise<RepoData[]> {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error(
      `Please set the GITHUB_TOKEN e.g. export GITHUB_TOKEN='mypersonalaccesstoken123'`,
    );
  }
  const baseUrl = getGithubBaseUrl(host);
  const octokit = new Octokit({ baseUrl, auth: githubToken });
  const res = await octokit.repos.listForOrg({
    org: orgName,
  });
  const repoData = res && res.data;

  if (!repoData.length) {
    return [];
  }
  const repos: RepoData[] = repoData
    .filter((repo) => !repo.archived)
    .map((repo) => ({
      fork: repo.fork,
      name: repo.name,
      owner: repo.owner.login,
      branch: repo.default_branch,
    }));
  return repos;
}
