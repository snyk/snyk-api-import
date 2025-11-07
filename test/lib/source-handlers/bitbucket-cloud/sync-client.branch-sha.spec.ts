import axios from 'axios';
import { BitbucketCloudSyncClient } from '../../../../src/lib/source-handlers/bitbucket-cloud/sync-client';
import type { BitbucketAuth } from '../../../../src/lib/source-handlers/bitbucket-cloud/sync-client';

jest.mock('axios');

describe('BitbucketCloudSyncClient branch->SHA fallback', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('resolves branch to sha and retries with candidate sha on 404', async () => {
    const auth: BitbucketAuth = {
      type: 'basic',
      username: 'user',
      appPassword: 'pass',
    } as any;

    // fake axios instance used by the client
    const fakeInstance: any = {
      get: jest.fn(),
      defaults: { baseURL: 'https://api.bitbucket.org/2.0/' },
    };

    // Mock axios.create() to return our fake instance
    mockedAxios.create.mockReturnValue(fakeInstance);

    // 1) refs search response (branch query) -> returns empty (no resolved sha)
    const refsResponse = {
      data: { values: [] },
      config: { url: '/refs/branches?q=name%20%3D%20%22feature/dev%22' },
    };

    // 2) initial /src/?at=feature/dev returns 404 with candidate shas in error body
    const notFoundError: any = new Error('Not Found');
    notFoundError.response = {
      status: 404,
      data: {
        error: { data: { shas: ['deadbeefcafebabe1234567890abcdef12345678'] } },
      },
    };

    // 3) retry with sha returns 200 with file list
    const shaResponse = {
      data: { values: [{ path: 'README.md' }, { path: 'package.json' }] },
      config: { url: '/src/?at=deadbeefcafebabe1234567890abcdef12345678' },
    };

    // Arrange an implementation based on the requested URL so order doesn't
    // matter and different URL forms are handled.
    fakeInstance.get.mockImplementation((url: string) => {
      if (typeof url !== 'string')
        return Promise.resolve({ data: { values: [] } });
      if (url.includes('/refs/branches'))
        return Promise.resolve(refsResponse as any);
      if (url.includes('src/?at=feature%2Fdev'))
        return Promise.reject(notFoundError);
      if (url.includes('deadbeefcafebabe1234567890abcdef12345678'))
        return Promise.resolve(shaResponse as any);
      if (url.includes('/src/feature%2Fdev/'))
        return Promise.resolve(shaResponse as any);
      return Promise.resolve({ data: { values: [] } } as any);
    });

    const client = new BitbucketCloudSyncClient(auth);

    const files = await client.listFiles('workspace', 'repo', 'feature/dev');

    expect(files).toEqual(['README.md', 'package.json']);

    // Verify the client tried the encoded query and then retried with sha URL
    expect(fakeInstance.get).toHaveBeenCalled();
    const calls = fakeInstance.get.mock.calls.map((c: any[]) => c[0]);
    // first call should be refs search path
    expect(calls[0]).toEqual(expect.stringContaining('refs/branches'));
    // second call should be the query-param src with branch
    expect(calls[1]).toEqual(expect.stringContaining('src/?at='));
    // third call should include the sha
    expect(calls[2]).toEqual(
      expect.stringContaining('deadbeefcafebabe1234567890abcdef12345678'),
    );
  });
});
