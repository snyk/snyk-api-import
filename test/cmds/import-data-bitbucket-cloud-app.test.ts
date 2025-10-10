import { generateOrgData } from '../../src/cmds/import:data';
import { SupportedIntegrationTypesImportData } from '../../src/lib/types';

describe('CLI import:data --source=bitbucket-cloud-app', () => {
  it('throws if orgsData is missing or invalid', async () => {
    await expect(
      generateOrgData(
        SupportedIntegrationTypesImportData.BITBUCKET_CLOUD_APP,
        '',
        ''
      )
    ).resolves.toMatchObject({ exitCode: 1 });
  });

  // it('returns import data on success', async () => {
  //   // mock orgsData and Bitbucket API responses
  //   // expect(await generateOrgData(...)).toMatchObject({ exitCode: 0, fileName: expect.any(String) });
  // });
});
