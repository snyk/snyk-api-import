import {
  generateOrgImportDataFile,
  Sources,
} from '../../src/scripts/generate-org-data';
import { deleteFiles } from '../delete-files';

describe('generateOrgImportDataFile Github script', () => {
  const OLD_ENV = process.env;
  process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
  process.env.SNYK_LOG_PATH = __dirname;
  afterAll(async () => {
    process.env = { ...OLD_ENV };
    await deleteFiles(['groupIdExample-sourceOrgIdExample-orgs.json']);
  });
  it('generate Github Orgs data', async () => {
    const groupId = 'groupIdExample';
    const sourceOrgId = 'sourceOrgIdExample';

    const res = await generateOrgImportDataFile(
      Sources.GITHUB,
      groupId,
      sourceOrgId,
    );
    expect(res.fileName).toEqual('group-groupIdExample-github-com-orgs.json');
    expect(res.orgs.length > 0).toBeTruthy();
    expect(res.orgs[0]).toEqual({
      name: expect.any(String),
      groupId,
      sourceOrgId,
    });
  });
  it('generate Github Orgs data without sourceOrgId', async () => {
    const groupId = 'groupIdExample';

    const res = await generateOrgImportDataFile(Sources.GITHUB, groupId);
    expect(res.fileName).toEqual('group-groupIdExample-github-com-orgs.json');
    expect(res.orgs.length > 0).toBeTruthy();
    expect(res.orgs[0]).toEqual({
      name: expect.any(String),
      groupId,
    });
  });
});
