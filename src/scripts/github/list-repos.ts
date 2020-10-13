import { Octokit } from '@octokit/rest';

interface RepoData {
  fork: boolean;
  branch: string;
  owner: string;
  name: string;
}
export async function listGithubRepos(orgName: string): Promise<RepoData[]> {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error(
      `Please set the GITHUB_TOKEN e.g. export GITHUB_TOKEN='mypersonalaccesstoken123'`,
    );
  }
  const octokit = new Octokit({ auth: githubToken });
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
