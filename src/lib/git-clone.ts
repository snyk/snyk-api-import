import * as debugLib from 'debug';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import type { SimpleGitOptions } from 'simple-git';
import { simpleGit } from 'simple-git';
import * as github from '../lib/source-handlers/github';
import type { RepoMetaData } from './types';
import { SupportedIntegrationTypesUpdateProject } from './types';

const debug = debugLib('snyk:git-clone');

const urlGenerators = {
  [SupportedIntegrationTypesUpdateProject.GITHUB]: github.buildGitCloneUrl,
  [SupportedIntegrationTypesUpdateProject.GHE]: github.buildGitCloneUrl,
};

interface GitCloneResponse {
  success: boolean;
  repoPath?: string;
  gitResponse: string;
}

const MAX_RETRIES = 2;
export async function gitClone(
  integrationType: SupportedIntegrationTypesUpdateProject,
  meta: RepoMetaData,
  retryAttempt = 0,
): Promise<GitCloneResponse> {
  const repoClonePath = await fs.mkdtempSync(
    path.join(os.tmpdir(), `snyk-clone-${Date.now()}-${Math.random()}`),
  );
  try {
    const cloneUrl = urlGenerators[integrationType](meta);
    const options: Partial<SimpleGitOptions> = {
      baseDir: repoClonePath,
      binary: 'git',
      maxConcurrentProcesses: 6,
      trimmed: false,
    };
    debug(
      `Trying to shallow clone repo: ${meta.cloneUrl} (attempt ${retryAttempt}/${MAX_RETRIES})`,
    );
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
    debug(
      `Attempt ${retryAttempt} failed, could not shallow clone the repo:\n ${err}`,
    );
    if (fs.existsSync(repoClonePath)) {
      fs.rmdirSync(repoClonePath);
    }
    if (retryAttempt < MAX_RETRIES) {
      return gitClone(integrationType, meta, retryAttempt + 1);
    }
    return {
      success: false,
      gitResponse: err.message,
    };
  }
}
