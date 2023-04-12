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

export async function gitClone(
  integrationType: SupportedIntegrationTypesUpdateProject,
  meta: RepoMetaData,
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
      fs.rmdirSync(repoClonePath, { recursive: true, maxRetries: 3 });
    }
    return {
      success: false,
      gitResponse: err.message,
    };
  }
}
