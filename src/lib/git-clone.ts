import * as debugLib from 'debug';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import type { SimpleGitOptions } from 'simple-git';
import { simpleGit } from 'simple-git';
import * as github from '../lib/source-handlers/github';
import * as githubCloudApp from '../lib/source-handlers/github-cloud-app';
import type { RepoMetaData } from './types';
import { SupportedIntegrationTypesUpdateProject } from './types';
import { deleteDirectory } from './delete-directory';

const debug = debugLib('snyk:git-clone');

// Wrapper function for GitHub Cloud App to match the expected signature
async function buildGitHubCloudAppCloneUrl(
  meta: RepoMetaData,
): Promise<string> {
  // Extract owner and repo from the clone URL
  const urlMatch = meta.cloneUrl.match(
    /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/,
  );
  if (!urlMatch) {
    throw new Error(`Invalid GitHub URL format: ${meta.cloneUrl}`);
  }
  const [, owner, repo] = urlMatch;
  return githubCloudApp.getGitHubCloudAppCloneUrl(owner, repo);
}

const urlGenerators = {
  [SupportedIntegrationTypesUpdateProject.GITHUB]: github.buildGitCloneUrl,
  [SupportedIntegrationTypesUpdateProject.GITHUB_CLOUD_APP]:
    buildGitHubCloudAppCloneUrl,
  [SupportedIntegrationTypesUpdateProject.GHE]: github.buildGitCloneUrl,
};

interface GitCloneResponse {
  success: boolean;
  repoPath?: string;
  gitResponse: string;
}

export async function gitClone(
  integrationType: SupportedIntegrationTypesUpdateProject,
  meta: RepoMetaData,
): Promise<GitCloneResponse> {
  const repoClonePath = await fs.mkdtempSync(
    path.join(os.tmpdir(), `snyk-clone-${Date.now()}-${Math.random()}`),
  );
  try {
    const cloneUrl = await urlGenerators[integrationType](meta);
    const options: Partial<SimpleGitOptions> = {
      baseDir: repoClonePath,
      binary: 'git',
      maxConcurrentProcesses: 6,
      trimmed: false,
    };
    debug(`Trying to shallow clone repo: ${meta.cloneUrl}`);
    const git = simpleGit(options);
    const output = await git.clone(cloneUrl, repoClonePath, {
      '--depth': '1',
      '--branch': meta.branch,
    });

    debug(`Repo ${meta.cloneUrl} was cloned`);
    return {
      gitResponse: output,
      success: true,
      repoPath: repoClonePath,
    };
  } catch (err: any) {
    debug(`Could not shallow clone the repo:\n ${err}`);
    if (fs.existsSync(repoClonePath)) {
      await deleteDirectory(repoClonePath);
    }
    return {
      success: false,
      gitResponse: err.message,
    };
  }
}
