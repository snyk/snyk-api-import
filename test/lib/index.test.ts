import {
  importTarget,
  pollImportUrl,
  importTargets,
  pollImportUrls,
} from '../../src/lib';
import { Status } from '../../src/lib/types';

// TODO: afterEach delete the new projects
test('Import & Poll a repo', async () => {
  const { pollingUrl } = await importTarget(
    'f0125d9b-271a-4b50-ad23-80e12575a1bf',
    'c4de291b-e083-4c43-a72c-113463e0d268',
    {
      name: 'shallow-goof-policy',
      owner: 'snyk-fixtures',
      branch: 'master',
    },
  );
  expect(pollingUrl).not.toBeNull();
  const importLog = await pollImportUrl(pollingUrl);
  expect(importLog).toMatchObject({
    id: expect.any(String),
    status: 'complete',
    created: expect.any(String),
  });
  expect(importLog.logs.length).toBe(1);
  expect(importLog.logs[0]).toMatchObject({
    name: 'snyk-fixtures/shallow-goof-policy',
    created: expect.any(String),
    status: 'complete',
    projects: [
      {
        projectUrl: expect.any(String),
        success: true,
        targetFile: expect.any(String),
      },
    ],
  });
}, 30000000);

test('importTargets &  pollImportUrls multiple repos', async () => {
  const pollingUrls = await importTargets([
    {
      orgId: 'f0125d9b-271a-4b50-ad23-80e12575a1bf',
      integrationId: 'c4de291b-e083-4c43-a72c-113463e0d268',
      target: {
        name: 'shallow-goof-policy',
        owner: 'snyk-fixtures',
        branch: 'master',
      },
    },
    {
      orgId: 'f0125d9b-271a-4b50-ad23-80e12575a1bf',
      integrationId: 'c4de291b-e083-4c43-a72c-113463e0d268',
      target: {
        name: 'ruby-with-versions',
        owner: 'snyk-fixtures',
        branch: 'master',
      },
    },
    {
      orgId: 'f0125d9b-271a-4b50-ad23-80e12575a1bf',
      integrationId: 'c4de291b-e083-4c43-a72c-113463e0d268',
      target: {
        name: 'composer-with-vulns',
        owner: 'snyk-fixtures',
        branch: 'master',
      },
    },
  ]);
  expect(pollingUrls.length >= 1).toBeTruthy();
  const importLog = await pollImportUrls(pollingUrls);
  expect(importLog[0]).toMatchObject({
    id: expect.any(String),
    status: 'complete',
    created: expect.any(String),
  });
  // at least one job successfully finished
  expect(importLog[0].logs[0]).toMatchObject({
    name: expect.any(String),
    created: expect.any(String),
    status: 'complete',
    projects: [
      {
        projectUrl: expect.any(String),
        success: true,
        targetFile: expect.any(String),
      },
    ],
  });
  expect(
    importLog[0].logs.every((job) => job.status === Status.COMPLETE),
  ).toBeTruthy();
}, 30000000);

test.todo('Import & poll in one');
test.todo('Failed import 100%');
test.todo('Only 1 import fails out of a few + logs created');
test.todo('If we stopped half way, restarted from where we left');
