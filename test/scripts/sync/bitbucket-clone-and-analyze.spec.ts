import { bitbucketCloneAndAnalyze } from '../../../src/scripts/sync/bitbucket-clone-and-analyze';
import type { RepoMetaData, SnykProject, SyncTargetsConfig } from '../../../src/lib/types';
import type { BitbucketAuth } from '../../../src/lib/source-handlers/bitbucket-cloud/sync-client';

describe('bitbucketCloneAndAnalyze', () => {
  it('should return correct import/remove lists for Bitbucket repo', async () => {
    const projects: SnykProject[] = [
      {
        name: 'workspace/repo:package.json',
        id: '123',
        created: '2022-01-01T00:00:00.000Z',
        origin: 'bitbucket-cloud',
        type: 'npm',
        branch: 'main',
        status: 'active',
      },
    ];
    const repoMeta: RepoMetaData = {
      branch: 'main',
      archived: false,
      cloneUrl: '',
      sshUrl: '',
    };
    const config: SyncTargetsConfig = {
      dryRun: false,
      entitlements: ['openSource'],
      manifestTypes: ['npm'],
      exclusionGlobs: [],
    };
    const bitbucketAuth: BitbucketAuth = {
      type: 'basic',
      username: 'fakeuser',
      appPassword: 'fakepass',
    };
    // Mock API response
    jest.spyOn(
      require('../../../src/lib/source-handlers/bitbucket-cloud/sync-client'),
      'BitbucketCloudSyncClient',
    ).mockImplementation(() => ({
      listFiles: async () => ['package.json', 'newfile.json'],
    }));
  const target = { owner: 'workspace', name: 'repo' };
  const res = await bitbucketCloneAndAnalyze(repoMeta, projects, config, bitbucketAuth, target);
    expect(res.import).toContain('newfile.json');
    expect(res.remove).toEqual([]);
  });
});
