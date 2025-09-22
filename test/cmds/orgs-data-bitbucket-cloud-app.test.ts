import { generateOrgImportData } from '../../src/cmds/orgs:data';
import { SupportedIntegrationTypesImportOrgData } from '../../src/lib/types';

describe('CLI orgs:data --source=bitbucket-cloud-app', () => {
  it('throws if env vars are missing', async () => {
    const original = { ...process.env };
    delete process.env.BITBUCKET_APP_CLIENT_ID;
    delete process.env.BITBUCKET_APP_CLIENT_SECRET;
    await expect(
      generateOrgImportData(
        SupportedIntegrationTypesImportOrgData.BITBUCKET_CLOUD_APP,
        'dummy-group-id'
      )
    ).resolves.toMatchObject({ exitCode: 1 });
    process.env = original;
  });

  // it('returns org data on success', async () => {
  //   // mock Bitbucket API responses and env vars
  //   // expect(await generateOrgImportData(...)).toMatchObject({ exitCode: 0, fileName: expect.any(String) });
  // });
});
