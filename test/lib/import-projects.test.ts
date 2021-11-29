import * as path from 'path';

import {
  parseLogIntoTargetIds,
  shouldSkipTarget,
} from '../../src/scripts/import-projects';

describe('Skip target if found in log', () => {
  it('Target and empty log should not be skipped', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'snyk-fixtures',
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
      parseLogIntoTargetIds((undefined as unknown) as string),
    ).rejects.toThrow('Received undefined');
  });

  it('Target already in log twice should be skipped', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'snyk-fixtures',
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
      owner: 'snyk-fixtures',
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
      owner: 'snyk-fixtures',
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
      owner: 'snyk-fixtures',
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
      owner: 'snyk-fixtures',
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
