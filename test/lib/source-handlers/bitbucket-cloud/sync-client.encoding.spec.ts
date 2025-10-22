import axios from 'axios';
import { BitbucketCloudSyncClient } from '../../../../src/lib/source-handlers/bitbucket-cloud/sync-client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BitbucketCloudSyncClient URL encoding', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('encodes branch names with slashes when calling listFiles', async () => {
    const fakeInstance = { get: jest.fn() } as any;
    // Mock response: single page with two file paths
    fakeInstance.get.mockResolvedValue({
      data: { values: ['package.json', 'src/lib/file.js'] },
      config: { url: '/repositories/org/repo/src/feature%2Fbranch/?pagelen=100&max_depth=10' },
    });
    mockedAxios.create.mockReturnValue(fakeInstance);

  const client = new BitbucketCloudSyncClient({ type: 'basic', username: 'user', appPassword: 'pass' } as any);

    const files = await client.listFiles('org', 'repo', 'feature/branch');

    expect(fakeInstance.get).toHaveBeenCalledTimes(1);
    expect(fakeInstance.get).toHaveBeenCalledWith(
      `/repositories/${encodeURIComponent('org')}/${encodeURIComponent('repo')}/src/?at=${encodeURIComponent('feature/branch')}&pagelen=100&max_depth=10`,
    );
    expect(files).toEqual(['package.json', 'src/lib/file.js']);
  });

  it('does not double-encode an already-encoded branch', async () => {
    const fakeInstance = { get: jest.fn() } as any;
    // Simulate API returning config.url that shows the requested URL
    fakeInstance.get.mockResolvedValue({
      data: { values: [] },
      config: { url: '/repositories/org/repo/src/feature%2Fbranch/?pagelen=100&max_depth=10' },
    });
    mockedAxios.create.mockReturnValue(fakeInstance);

  const client = new BitbucketCloudSyncClient({ type: 'basic', username: 'user', appPassword: 'pass' } as any);

    // Pass branch already percent-encoded
    await client.listFiles('org', 'repo', 'feature%2Fbranch');

    expect(fakeInstance.get).toHaveBeenCalledTimes(1);
    const calledUrl = fakeInstance.get.mock.calls[0][0] as string;
    // Should contain single-encoding %2F not %252F
    expect(calledUrl).toContain('%2F');
    expect(calledUrl).not.toContain('%252F');
  });

  it('encodes workspace and repo for getRepository and listBranches', async () => {
    const fakeInstance = { get: jest.fn() } as any;
    fakeInstance.get.mockResolvedValue({ data: { dummy: true }, config: { url: '/repositories/org%2Fname/repo%2Fwith%2Fslash' } });
    mockedAxios.create.mockReturnValue(fakeInstance);

  const client = new BitbucketCloudSyncClient({ type: 'basic', username: 'user', appPassword: 'pass' } as any);

    await client.getRepository('org/name', 'repo/with/slash');
    await client.listBranches('org/name', 'repo/with/slash');

    expect(fakeInstance.get).toHaveBeenCalledTimes(2);
    expect(fakeInstance.get.mock.calls[0][0]).toBe(`/repositories/${encodeURIComponent('org/name')}/${encodeURIComponent('repo/with/slash')}`);
    expect(fakeInstance.get.mock.calls[1][0]).toBe(`/repositories/${encodeURIComponent('org/name')}/${encodeURIComponent('repo/with/slash')}/refs/branches`);
  });
});
