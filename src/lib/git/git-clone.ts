import * as debugLib from 'debug';
import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';

const debug = debugLib('snyk:git-clone');

export async function cloneRepo(repoUrl: string): Promise<string> {

  const options: Partial<SimpleGitOptions> = {
    baseDir: process.cwd(),
    binary: 'git',
    maxConcurrentProcesses: 6,
    trimmed: false,
  };

  const git: SimpleGit = simpleGit(options);
  const gitFolder = process.env.LOCAL_GIT_FOLDER ? process.env.LOCAL_GIT_FOLDER : './';

  try {
    debug(`Attemting to shallow clone repo: ${repoUrl}`);
    await git.clone(repoUrl, gitFolder , { '--depth': '1' });
    debug(`Repo ${repoUrl} was cloned to ${gitFolder}`)
  } catch (err) {
    debug(`Could not shallow clone the repo:\n ${err}`);
  }
  return gitFolder;
}