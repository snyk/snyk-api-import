import { Octokit } from '@octokit/rest';

export interface GithubOrgData {
  name: string;
  id: number;
  url: string;
}
export async function listGithubOrgs(): Promise<GithubOrgData[]> {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error(
      `Please set the GITHUB_TOKEN e.g. export GITHUB_TOKEN='mypersonalaccesstoken123'`,
    );
  }
  const octokit = new Octokit({ auth: githubToken });
  const res = await octokit.orgs.listForAuthenticatedUser();
  const orgsData = res && res.data;

  if (!orgsData.length) {
    return [];
  }
  const orgs: GithubOrgData[] = orgsData.map((org) => ({
    name: org.login,
    id: org.id,
    url: org.url,
  }));
  return orgs;
}
