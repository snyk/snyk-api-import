import axios from 'axios';
import { cloneAndAnalyze } from '../../../../src/scripts/sync/clone-and-analyze';
import type { RepoMetaData, SnykProject } from '../../../../src/lib/types';
import { SupportedIntegrationTypesUpdateProject } from '../../../../src/lib/types';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Bitbucket Server auth handling', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('hard fails on 401 when listing files', async () => {
    const projects: SnykProject[] = [];
    const repoMeta: RepoMetaData = {
      branch: 'main',
      archived: false,
      cloneUrl: '',
      sshUrl: '',
    };
    const config = {
      dryRun: false,
      entitlements: ['openSource' as any],
      manifestTypes: ['package.json'],
      exclusionGlobs: [],
    };
    const datacenterAuth = {
      sourceUrl: 'http://bitbucket-server',
      token: 'servertoken',
    };
    const target = { projectKey: 'PROJ', repoSlug: 'repo', branch: 'main' };

    const error: any = new Error('Unauthorized');
    error.response = { status: 401, statusText: 'Unauthorized' };
    mockedAxios.get.mockRejectedValue(error);

    await expect(
      cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.BITBUCKET_SERVER,
        repoMeta,
        projects,
        config,
        'server',
        datacenterAuth,
        target,
      ),
    ).rejects.toThrow(/Authorization failed/);
  });
});
