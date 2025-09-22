import { generateOrgImportData } from '../../src/cmds/orgs:data';
import { generateOrgData } from '../../src/cmds/import:data';
import { SupportedIntegrationTypesImportOrgData, SupportedIntegrationTypesImportData } from '../../src/lib/types';

describe('Bitbucket Cloud App integration', () => {
  it('fails gracefully if env vars are missing', async () => {
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

  it('fails gracefully if orgsData is missing or invalid', async () => {
    await expect(
      generateOrgData(
        SupportedIntegrationTypesImportData.BITBUCKET_CLOUD_APP,
        '',
        ''
      )
    ).resolves.toMatchObject({ exitCode: 1 });
  });

  // it('performs end-to-end import with valid Bitbucket Cloud App config', async () => {
  //   // mock env vars and Bitbucket API responses
  //   // expect(await generateOrgImportData(...)).toMatchObject({ exitCode: 0 });
  //   // expect(await generateOrgData(...)).toMatchObject({ exitCode: 0 });
  // });
});
