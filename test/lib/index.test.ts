import { importTarget, pollImportUrl } from '../../src/lib';

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
    status: 'complete',
  });
}, 30000000);
