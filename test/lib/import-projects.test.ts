import { skipTargetIfFoundInLog } from '../../src/scripts/import-projects';

describe('Skip target if found in log', () => {
  it('Target and empty log should not be skipped', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'snyk-fixtures',
      branch: 'master',
    }
    const importTarget = {
      integrationId: 'INTEGRATION_ID',
      orgId: 'ORG_ID',
      target,
    }
    const shouldSkip = await skipTargetIfFoundInLog(importTarget, '');
    expect(shouldSkip).toBeFalsy();

    const shouldSkipAgain = await skipTargetIfFoundInLog(importTarget, undefined as unknown as string);
    expect(shouldSkipAgain).toBeFalsy();
  });
  it('Target already in log should be skipped', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'snyk-fixtures',
      branch: 'master',
    }
    const importTarget = {
      integrationId: 'INTEGRATION_ID',
      orgId: 'ORG_ID',
      target,
    }
    const singleImportedTargetLog = {
      name: 'snyk:import-projects-script',
      hostname: 'MacBook-Pro-2.local',
      pid: 46657,
      level: 30,
      target,
      locationUrl:
        'https://snyk.io/api/v1/org/ORG_ID/integrations/INTEGRATION_ID/import/IMPORT_ID',
      orgId: 'ORG_ID',
      integrationId: 'INTEGRATION_ID',
      targetId:
        'ORG_ID:INTEGRATION_ID:composer-with-vulns:snyk-fixtures:master',
      msg: 'Target requested for import',
      time: '2020-10-26T14:53:20.234Z',
      v: 0,
    };

    const shouldSkip = await skipTargetIfFoundInLog(importTarget, JSON.stringify(singleImportedTargetLog));
    expect(shouldSkip).toBeTruthy();
  });
  it('Target already in log twice be skipped', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'snyk-fixtures',
      branch: 'master',
    }
    const importTarget = {
      integrationId: 'INTEGRATION_ID',
      orgId: 'ORG_ID',
      target,
    }
    const singleImportedTargetLog = {
      name: 'snyk:import-projects-script',
      hostname: 'MacBook-Pro-2.local',
      pid: 46657,
      level: 30,
      target,
      locationUrl:
        'https://snyk.io/api/v1/org/ORG_ID/integrations/INTEGRATION_ID/import/IMPORT_ID',
      orgId: 'ORG_ID',
      integrationId: 'INTEGRATION_ID',
      targetId:
        'ORG_ID:INTEGRATION_ID:composer-with-vulns:snyk-fixtures:master',
      msg: 'Target requested for import',
      time: '2020-10-26T14:53:20.234Z',
      v: 0,
    };

    const shouldSkip = await skipTargetIfFoundInLog(importTarget, JSON.stringify(singleImportedTargetLog) + JSON.stringify(singleImportedTargetLog));
    expect(shouldSkip).toBeTruthy();
  });
  it('Target not in log should not be skipped', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'snyk-fixtures',
      branch: 'master',
    }
    const importTarget = {
      integrationId: 'INTEGRATION_ID',
      orgId: 'ORG_ID',
      target: {
        ...target,
        branch: 'develop'
      },
    }
    const singleImportedTargetLog = {
      name: 'snyk:import-projects-script',
      hostname: 'MacBook-Pro-2.local',
      pid: 46657,
      level: 30,
      target,
      locationUrl:
        'https://snyk.io/api/v1/org/ORG_ID/integrations/INTEGRATION_ID/import/IMPORT_ID',
      orgId: 'ORG_ID',
      integrationId: 'INTEGRATION_ID',
      targetId:
        'ORG_ID:INTEGRATION_ID:composer-with-vulns:snyk-fixtures:master',
      msg: 'Target requested for import',
      time: '2020-10-26T14:53:20.234Z',
      v: 0,
    };

    const shouldSkip = await skipTargetIfFoundInLog(importTarget, JSON.stringify(singleImportedTargetLog));
    expect(shouldSkip).toBeFalsy();
  });
  it('Target with extra meta but already in log should be skipped', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'snyk-fixtures',
      branch: 'master',
      forked: true,
      isPrivate: false,
    }
    const importTarget = {
      integrationId: 'INTEGRATION_ID',
      orgId: 'ORG_ID',
      target,
    }
    const singleImportedTargetLog = {
      name: 'snyk:import-projects-script',
      hostname: 'MacBook-Pro-2.local',
      pid: 46657,
      level: 30,
      target,
      locationUrl:
        'https://snyk.io/api/v1/org/ORG_ID/integrations/INTEGRATION_ID/import/IMPORT_ID',
      orgId: 'ORG_ID',
      integrationId: 'INTEGRATION_ID',
      targetId:
        'ORG_ID:INTEGRATION_ID:composer-with-vulns:snyk-fixtures:master',
      msg: 'Target requested for import',
      time: '2020-10-26T14:53:20.234Z',
      v: 0,
    };

    const shouldSkip = await skipTargetIfFoundInLog(importTarget, JSON.stringify(singleImportedTargetLog));
    expect(shouldSkip).toBeTruthy();
  });
  it('Same target but for different org should not be skipped', async () => {
    const target = {
      name: 'composer-with-vulns',
      owner: 'snyk-fixtures',
      branch: 'master',
      forked: true,
      isPrivate: false,
    }
    const importTarget = {
      integrationId: 'INTEGRATION_ID_NEW',
      orgId: 'ORG_ID_NEW',
      target,
    }
    const singleImportedTargetLog = {
      name: 'snyk:import-projects-script',
      hostname: 'MacBook-Pro-2.local',
      pid: 46657,
      level: 30,
      target,
      locationUrl:
        'https://snyk.io/api/v1/org/ORG_ID/integrations/INTEGRATION_ID/import/IMPORT_ID',
      orgId: 'ORG_ID',
      integrationId: 'INTEGRATION_ID',
      targetId:
        'ORG_ID:INTEGRATION_ID:composer-with-vulns:snyk-fixtures:master',
      msg: 'Target requested for import',
      time: '2020-10-26T14:53:20.234Z',
      v: 0,
    };

    const shouldSkip = await skipTargetIfFoundInLog(importTarget, JSON.stringify(singleImportedTargetLog));
    expect(shouldSkip).toBeFalsy();
  });
});
