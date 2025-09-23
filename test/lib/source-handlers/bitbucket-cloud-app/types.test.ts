import type { BitbucketCloudAppOrgData, BitbucketCloudAppRepoData, BitbucketAppConfig } from '../../../../src/lib/source-handlers/bitbucket-cloud-app/types';

describe('BitbucketCloudApp types', () => {
  it('should allow valid org and repo data', () => {
    const org: BitbucketCloudAppOrgData = { uuid: 'u', name: 'n', workspace: 'w' };
    // eslint-disable-next-line @typescript-eslint/naming-convention
  const repo: BitbucketCloudAppRepoData = { uuid: 'u', name: 'n', workspace: 'w', isPrivate: true };
    const config: BitbucketAppConfig = { clientId: 'id', clientSecret: 'secret' };
    expect(org).toBeDefined();
    expect(repo).toBeDefined();
    expect(config).toBeDefined();
  });
});
