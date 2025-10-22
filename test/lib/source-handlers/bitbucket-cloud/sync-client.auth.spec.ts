import axios from 'axios';
import { BitbucketCloudSyncClient } from '../../../../src/lib/source-handlers/bitbucket-cloud/sync-client';
import type { BitbucketAuth } from '../../../../src/lib/source-handlers/bitbucket-cloud/sync-client';

jest.mock('axios');

describe('BitbucketCloudSyncClient auth', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('uses axios auth option for basic credentials', () => {
    const auth: BitbucketAuth = { type: 'basic', username: 'user', appPassword: 'pass' } as any;
    // axios.create returns an instance; we'll mock it to capture the config
    const fakeInstance = { get: jest.fn() } as any;
    mockedAxios.create.mockReturnValue(fakeInstance);

    new BitbucketCloudSyncClient(auth);
    expect(mockedAxios.create).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'https://api.bitbucket.org/2.0/',
      auth: { username: 'user', password: 'pass' },
    }));
  });

  it('throws on 401 when listing files', async () => {
    const auth: BitbucketAuth = { type: 'basic', username: 'user', appPassword: 'pass' } as any;
    const fakeInstance = { get: jest.fn() } as any;
    // When listFiles calls client.get, it should throw with response.status 401
    const error: any = new Error('Unauthorized');
    error.response = { status: 401, statusText: 'Unauthorized' };
    fakeInstance.get.mockRejectedValue(error);
    mockedAxios.create.mockReturnValue(fakeInstance);

    const client = new BitbucketCloudSyncClient(auth);

    await expect(client.listFiles('space', 'repo', 'main')).rejects.toThrow(/Authorization failed|Bitbucket API error/);
  });
});
