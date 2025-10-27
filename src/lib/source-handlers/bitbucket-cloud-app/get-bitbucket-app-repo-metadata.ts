import type { RepoMetaData, Target } from '../../types';
import { listBitbucketCloudAppRepos } from './list-repos';
import debugModule from 'debug';

const debug = debugModule('snyk:bitbucket-cloud-app-metadata');

/**
 * Given a target (owner + name) attempt to find the repo via the Bitbucket Cloud App API
 * and return the RepoMetaData that sync expects.
 */
export async function getBitbucketAppRepoMetaData(
  target: Target,
): Promise<RepoMetaData> {
  if (!target.owner || !target.name) {
    throw new Error(
      'Bitbucket Cloud App target must have owner and name properties',
    );
  }

  const workspace = target.owner;
  const repoSlug = target.name;

  debug(`Fetching repo metadata for ${workspace}/${repoSlug}`);

  // list repos for the workspace and find the one that matches the slug/full_name
  const repos = await listBitbucketCloudAppRepos(workspace);
  const repo = repos.find(
    (r) => r.name === repoSlug || r.full_name === `${workspace}/${repoSlug}`,
  );

  if (!repo) {
    // When the app-scoped repo listing does not include the requested repo
    // it's usually because the app is not installed on the workspace or
    // the app token lacks repository read permissions. Throw an explicit
    // error so callers (and logs) make the root cause obvious during sync.
    debug(
      `[Bitbucket Cloud App] Repo ${workspace}/${repoSlug} was not found in app-scoped listing. This likely means the app is not installed on the workspace or lacks repository read permissions.`,
    );
    throw new Error(
      `Bitbucket Cloud App cannot find repo ${workspace}/${repoSlug}. Ensure the OAuth consumer (app) is installed on the workspace and has permissions to read repositories.`,
    );
  }

  // Construct common clone URL values. Prefer HTTPS clone URL for Bitbucket Cloud App
  // by default so environments that don't have SSH configured can still clone.
  // Keep SSH clone URL available in `sshUrl` in case callers want to use deploy keys.
  const sshClone = `git@bitbucket.org:${repo.full_name}.git`;
  const httpsClone = `https://bitbucket.org/${repo.full_name}.git`;

  return {
    branch:
      repo.branch || (typeof target.branch === 'string' ? target.branch : ''),
    // Prefer HTTPS for cloning by default for cloud-app targets
    cloneUrl: httpsClone,
    sshUrl: sshClone,
    archived: !!repo.fork || false,
  };
}

export default getBitbucketAppRepoMetaData;
