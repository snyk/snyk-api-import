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
    '71a1561a-5a08-4d7e-80e4-699a12d73d4c',
    '6f2644e2-ac86-4701-b0c3-0c8f07fa7fc3',
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
      orgId: '71a1561a-5a08-4d7e-80e4-699a12d73d4c',
      integrationId: '6f2644e2-ac86-4701-b0c3-0c8f07fa7fc3',
      target: {
        name: 'shallow-goof-policy',
        owner: 'snyk-fixtures',
        branch: 'master',
      },
    },
    {
      orgId: '71a1561a-5a08-4d7e-80e4-699a12d73d4c',
      integrationId: '6f2644e2-ac86-4701-b0c3-0c8f07fa7fc3',
      target: {
        name: 'ruby-with-versions',
        owner: 'snyk-fixtures',
        branch: 'master',
      },
    },
    {
      orgId: '71a1561a-5a08-4d7e-80e4-699a12d73d4c',
      integrationId: '6f2644e2-ac86-4701-b0c3-0c8f07fa7fc3',
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
