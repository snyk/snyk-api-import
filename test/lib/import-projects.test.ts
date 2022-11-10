import * as path from 'path';
import { requestsManager } from 'snyk-request-manager';
import { importTarget } from '../../src/lib';
import * as request from '../../src/lib/api/import/request-with-rate-limit';
import {
  parseLogIntoTargetIds,
  shouldSkipTarget,
} from '../../src/scripts/import-projects';

const requestWithRateLimitHandlingStub = jest
  .spyOn(request, 'requestWithRateLimitHandling')
  .mockResolvedValue({
    statusCode: 201,
    headers: { location: 'https://app.snyk.io/location' },
  });
describe('Skip target if found in log', () => {
  it('Target and empty log should not be skipped', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'api-import-circle-test',
      branch: 'master',
    };
    const importTarget = {
      integrationId: 'INTEGRATION_ID',
      orgId: 'ORG_ID',
      target,
    };
    const logPath = path.resolve(__dirname + `/fixtures/empty.logx`);
    const importedTargetIds = await parseLogIntoTargetIds(logPath);
    const shouldSkip = await shouldSkipTarget(importTarget, importedTargetIds);
    expect(shouldSkip).toBeFalsy();
  });

  it('Trying to parse without a log name should throw', async () => {
    expect(
      parseLogIntoTargetIds(undefined as unknown as string),
    ).rejects.toThrow('Received undefined');
  });

  it('Target already in log twice should be skipped', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'api-import-circle-test',
      branch: 'master',
    };
    const importTarget = {
      integrationId: 'INTEGRATION_ID',
      orgId: 'ORG_ID',
      target,
    };
    const logPath = path.resolve(__dirname + `/fixtures/non-empty.logx`);
    const importedTargetIds = await parseLogIntoTargetIds(logPath);
    const shouldSkip = await shouldSkipTarget(importTarget, importedTargetIds);
    expect(shouldSkip).toBeTruthy();
  });
  it('Target not in log should not be skipped', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'api-import-circle-test',
      branch: 'develop',
    };
    const importTarget = {
      integrationId: 'INTEGRATION_ID',
      orgId: 'ORG_ID',
      target,
    };
    const logPath = path.resolve(__dirname + `/fixtures/non-empty.logx`);
    const importedTargetIds = await parseLogIntoTargetIds(logPath);
    const shouldSkip = await shouldSkipTarget(importTarget, importedTargetIds);
    expect(shouldSkip).toBeFalsy();
  });
  it('Target with extra meta but already in log should be skipped', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'api-import-circle-test',
      branch: 'master',
      forked: true,
      isPrivate: false,
    };
    const importTarget = {
      integrationId: 'INTEGRATION_ID',
      orgId: 'ORG_ID',
      target,
    };
    const logPath = path.resolve(__dirname + `/fixtures/non-empty.logx`);
    const importedTargetIds = await parseLogIntoTargetIds(logPath);
    const shouldSkip = await shouldSkipTarget(importTarget, importedTargetIds);
    expect(shouldSkip).toBeTruthy();
  });
  it('Same target but for different org should not be skipped', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'api-import-circle-test',
      branch: 'master',
      forked: true,
      isPrivate: false,
    };
    const importTarget = {
      integrationId: 'INTEGRATION_ID_NEW',
      orgId: 'ORG_ID_NEW',
      target,
    };

    const logPath = path.resolve(__dirname + `/fixtures/non-empty.logx`);
    const importedTargetIds = await parseLogIntoTargetIds(logPath);
    const shouldSkip = await shouldSkipTarget(importTarget, importedTargetIds);
    expect(shouldSkip).toBeFalsy();
  });

  it('Gitlab target with repo ID should be skipped', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'api-import-circle-test',
      branch: 'master',
      forked: true,
      isPrivate: false,
      id: 123,
    };
    const importTarget = {
      integrationId: 'INTEGRATION_ID_NEW',
      orgId: 'ORG_ID_NEW',
      target,
    };

    const logPath = path.resolve(__dirname + `/fixtures/non-empty.logx`);
    const importedTargetIds = await parseLogIntoTargetIds(logPath);
    const shouldSkip = await shouldSkipTarget(importTarget, importedTargetIds);
    expect(shouldSkip).toBeFalsy();
  });
});

describe('importTarget()', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_API = process.env.SNYK_API_TEST as string;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;
  process.env.SNYK_LOG_PATH = path.resolve(__dirname + `/fixtures/`);
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  afterAll(() => {
    process.env = { ...OLD_ENV };
  });
  it('Target is always sanitized', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'api-import-circle-test',
      branch: 'master',
      fork: true,
    };
    await importTarget(requestManager, 'ORG_ID', 'INTEGRATION_ID', target);
    expect(requestWithRateLimitHandlingStub).toHaveBeenCalled();
    expect(requestWithRateLimitHandlingStub).lastCalledWith(
      expect.any(Object),
      '/org/ORG_ID/integrations/INTEGRATION_ID/import',
      'post',
      {
        exclusionGlobs: undefined,
        files: undefined,
        target: {
          branch: 'master',
          name: 'composer-with-vulns',
          owner: 'api-import-circle-test',
        },
      },
    );
  });
});
