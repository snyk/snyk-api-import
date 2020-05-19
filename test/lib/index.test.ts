import { importTarget, pollImportUrl, importTargets } from '../../src/lib';

test('Import a repo', async () => {
  const { pollingUrl } = await importTarget(
    '71a1561a-5a08-4d7e-80e4-699a12d73d4c',
    '6f2644e2-ac86-4701-b0c3-0c8f07fa7fc3',
    {
      name: 'vulnerable-nextjs',
      owner: 'lili2311',
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
  expect(importLog.logs[0]).toMatchObject({
    name: 'lili2311/vulnerable-nextjs',
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

test.only('Import multiple repos', async () => {
  const pollingUrls = await importTargets([
    {
      orgId: '71a1561a-5a08-4d7e-80e4-699a12d73d4c',
      integrationId: '6f2644e2-ac86-4701-b0c3-0c8f07fa7fc3',
      target: {
        name: 'vulnerable-nextjs',
        owner: 'lili2311',
        branch: 'master',
      },
    },
    {
      orgId: '71a1561a-5a08-4d7e-80e4-699a12d73d4c',
      integrationId: '6f2644e2-ac86-4701-b0c3-0c8f07fa7fc3',
      target: {
        name: 'yarn-projects',
        owner: 'lili2311',
        branch: 'master',
      },
    },
    {
      orgId: '71a1561a-5a08-4d7e-80e4-699a12d73d4c',
      integrationId: '6f2644e2-ac86-4701-b0c3-0c8f07fa7fc3',
      target: {
        name: 'simple-repo',
        owner: 'lili2311',
        branch: 'master',
      },
    },
  ]);
  expect(pollingUrls).not.toBeNull();
  const importLog = await pollImportUrl(pollingUrls[0]);
  expect(importLog).toMatchObject({
    id: expect.any(String),
    status: 'complete',
    created: expect.any(String),
  });
  expect(importLog.logs[0]).toMatchObject({
    name: 'lili2311/vulnerable-nextjs',
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
