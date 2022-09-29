import { Octokit } from '@octokit/rest';
import * as debugLib from 'debug';
import { CommitFiles } from './types';
import { getGithubToken } from './get-github-token';
import { getGithubBaseUrl } from './github-base-url';

const debug = debugLib('snyk:get-commit-script');

export async function fetchCommitFiles(
  owner: string,
  repo: string,
  sha: string,
  host?: string
): Promise<CommitFiles[]> {
  debug(`Fetching commit files for commit sha: ${sha}`);
  const githubToken = getGithubToken();
  const baseUrl = getGithubBaseUrl(host);
  const octokit: Octokit = new Octokit({ baseUrl, auth: githubToken });
  const files: CommitFiles[] = [];
  const params = {
    owner: owner,
    repo: repo,
    ref: sha,
  };
  const res = await octokit.repos.getCommit(params);
  const commits = res.data.files?.filter(
    (commit) => commit.status == "renamed"
  );
  if (commits && commits.length) {
    for (let i = 0; i < commits.length; i ++) {
      files.push({
        filename: commits[i].filename,
        status: commits[i].status,
        previous_filename: commits[i].previous_filename
      })
    }
  }
  return files;
}
