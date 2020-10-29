import * as _ from 'lodash';
import * as path from 'path';
import { CreatedOrg } from '../../src/lib/types';
import { Sources } from '../../src/scripts/generate-org-data';
import {
  generateTargetsImportDataFile,
  SupportedIntegrationTypes,
} from '../../src/scripts/generate-targets-data';
import { deleteFiles } from '../delete-files';

describe('generateTargetsImportDataFile Github script', () => {
  const OLD_ENV = process.env;
  process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
  process.env.SNYK_LOG_PATH = __dirname;
  const filesToDelete: string[] = [];
  afterEach(async () => {
    process.env = { ...OLD_ENV };
    await deleteFiles(filesToDelete);
  });
  it('generate Github Orgs data', async () => {
    filesToDelete.push(path.resolve(__dirname + '/github-import-targets.json'));
    const orgsData: CreatedOrg[] = [
      {
        orgId: 'org-id',
        name: process.env.TEST_GH_ORG_NAME as string,
        groupId: 'group-id',
        origName: process.env.TEST_GH_ORG_NAME as string,
        integrations: {
          github: 'github-********-********-********',
          'github-enterprise': 'github-enterprise-********-********',
        },
        sourceOrgId: 'source-org-id',
      },
    ];

    const res = await generateTargetsImportDataFile(
      Sources.GITHUB,
      orgsData,
      SupportedIntegrationTypes.GITHUB,
    );
    expect(res.fileName).toEqual('github-import-targets.json');
    expect(res.targets.length > 0).toBeTruthy();
    expect(res.targets[0]).toEqual({
      target: {
        name: expect.any(String),
        branch: expect.any(String),
        owner: expect.any(String),
        fork: expect.any(Boolean),
      },
      integrationId: 'github-********-********-********',
      orgId: 'org-id',
    });
  });

  it('generate Github Orgs data', async () => {
    const orgsData: CreatedOrg[] = [
      {
        orgId: process.env.TEST_GH_ORG_NAME as string,
        name: process.env.TEST_GH_ORG_NAME as string,
        groupId: 'group-id',
        origName: process.env.TEST_GH_ORG_NAME as string,
        integrations: {},
        sourceOrgId: 'source-org-id',
      },
    ];

    expect(
      generateTargetsImportDataFile(
        Sources.GITHUB,
        orgsData,
        SupportedIntegrationTypes.GITHUB,
      ),
    ).rejects.toThrow(
      'No targets could be generated. Check the error output & try again.',
    );
  });
  it('Duplicate orgs are ignored', async () => {
    filesToDelete.push(path.resolve(__dirname + '/github-import-targets.json'));
    const orgsData: CreatedOrg[] = [
      {
        orgId: process.env.TEST_GH_ORG_NAME as string,
        name: process.env.TEST_GH_ORG_NAME as string,
        groupId: 'group-id',
        origName: process.env.TEST_GH_ORG_NAME as string,
        integrations: {
          github: 'github-********-********-********',
          'github-enterprise': 'github-enterprise-********-********',
        },
        sourceOrgId: 'source-org-id',
      },
      // same again!
      {
        orgId: process.env.TEST_GH_ORG_NAME as string,
        name: process.env.TEST_GH_ORG_NAME as string,
        groupId: 'group-id',
        origName: process.env.TEST_GH_ORG_NAME as string,
        integrations: {
          github: 'github-********-********-********',
          'github-enterprise': 'github-enterprise-********-********',
        },
        sourceOrgId: 'source-org-id',
      },
    ];

    const res = await generateTargetsImportDataFile(
      Sources.GITHUB,
      orgsData,
      SupportedIntegrationTypes.GITHUB,
    );
    expect(res.fileName).toEqual('github-import-targets.json');
    expect(res.targets.length > 0).toBeTruthy();
    expect(_.uniqBy(res.targets, 'target.name')).toBeTruthy();
    expect(res.targets[0]).toEqual({
      target: {
        name: expect.any(String),
        branch: expect.any(String),
        owner: expect.any(String),
        fork: expect.any(Boolean),
      },
      integrationId: expect.any(String),
      orgId: expect.any(String),
    });
  });
});
