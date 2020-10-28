import { Octokit } from '@octokit/rest';
import { url } from 'inspector';

export interface GithubOrgData {
  name: string;
  id: number;
  url: string;
}
export async function listGithubOrgs(host?: string): Promise<GithubOrgData[]> {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error(
      `Please set the GITHUB_TOKEN e.g. export GITHUB_TOKEN='mypersonalaccesstoken123'`,
    );
  }
  const baseUrl = host
    ? new URL('/api/v3', host).toString()
    : 'https://api.github.com';
  const octokit = new Octokit({ baseUrl, auth: githubToken });
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
