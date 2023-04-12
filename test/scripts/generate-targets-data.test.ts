import * as _ from 'lodash';
import * as path from 'path';
import type { CreatedOrg } from '../../src/lib/types';
import { SupportedIntegrationTypesImportData } from '../../src/lib/types';

import { generateTargetsImportDataFile } from '../../src/scripts/generate-targets-data';
import { deleteFiles } from '../delete-files';

describe('generateTargetsImportDataFile Github script', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_LOG_PATH = __dirname;
  const filesToDelete: string[] = [];
  afterEach(async () => {
    process.env = { ...OLD_ENV };
    await deleteFiles(filesToDelete);
  });
  it('generate Github repo data', async () => {
    process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
    filesToDelete.push(
      path.resolve(__dirname + '/github-enterprise-import-targets.json'),
    );
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
      SupportedIntegrationTypesImportData.GITHUB,
      orgsData,
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
  }, 20000);

  it('generate Github Enterprise repo data', async () => {
    process.env.GITHUB_TOKEN = process.env.TEST_GHE_TOKEN;
    const GHE_URL = process.env.TEST_GHE_URL;
    filesToDelete.push(
      path.resolve(__dirname + '/github-enterprise-import-targets.json'),
    );
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
      SupportedIntegrationTypesImportData.GHE,
      orgsData,
      GHE_URL,
    );
    expect(res.fileName).toEqual('github-enterprise-import-targets.json');
    expect(res.targets.length > 0).toBeTruthy();
    expect(res.targets[0]).toEqual({
      target: {
        name: expect.any(String),
        branch: expect.any(String),
        owner: expect.any(String),
        fork: expect.any(Boolean),
      },
      integrationId: 'github-enterprise-********-********',
      orgId: 'org-id',
    });
  }, 20000);

  it('generate Github repo data when no integrations are available', async () => {
    process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
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
        SupportedIntegrationTypesImportData.GITHUB,
        orgsData,
      ),
    ).rejects.toThrow(
      'No targets could be generated. Check the error output & try again.',
    );
  }, 30000);
  it('Duplicate orgs are ignored', async () => {
    process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
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
      SupportedIntegrationTypesImportData.GITHUB,
      orgsData,
    );
    expect(res.fileName).toEqual('github-import-targets.json');
    expect(res.targets.length > 0).toBeTruthy();
    expect(
      new Set(res.targets.map((t) => t.target.name)).size == res.targets.length,
    ).toBeTruthy();
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
  }, 30000);
});

describe('generateTargetsImportDataFile Gitlab script', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_LOG_PATH = __dirname;
  const filesToDelete: string[] = [];
  afterEach(async () => {
    process.env = { ...OLD_ENV };
    await deleteFiles(filesToDelete);
  });
  it('generate Gitlab repo data', async () => {
    const GITLAB_BASE_URL = process.env.TEST_GITLAB_BASE_URL;
    const GITLAB_ORG_NAME = process.env.TEST_GITLAB_ORG_NAME as string;
    process.env.GITLAB_TOKEN = process.env.TEST_GITLAB_TOKEN;

    filesToDelete.push(path.resolve(__dirname + '/gitlab-import-targets.json'));
    const orgsData: CreatedOrg[] = [
      {
        orgId: 'org-id',
        name: GITLAB_ORG_NAME,
        groupId: 'group-id',
        origName: GITLAB_ORG_NAME,
        integrations: {
          gitlab: 'gitlab-********-********',
        },
        sourceOrgId: 'source-org-id',
      },
    ];

    const res = await generateTargetsImportDataFile(
      SupportedIntegrationTypesImportData.GITLAB,
      orgsData,
      GITLAB_BASE_URL,
    );
    expect(res.fileName).toEqual('gitlab-import-targets.json');
    expect(res.targets.length > 0).toBeTruthy();
    expect(res.targets[0]).toEqual({
      target: {
        id: expect.any(Number),
        branch: expect.any(String),
        name: expect.any(String),
        fork: expect.any(Boolean),
      },
      integrationId: 'gitlab-********-********',
      orgId: 'org-id',
    });
  }, 10000);

  it('generate Gitlab repo data when no integrations are available', async () => {
    const GITLAB_BASE_URL = process.env.TEST_GITLAB_BASE_URL;
    const GITLAB_ORG_NAME = process.env.TEST_GITLAB_ORG_NAME as string;
    process.env.GITLAB_TOKEN = process.env.TEST_GITLAB_TOKEN;

    const orgsData: CreatedOrg[] = [
      {
        orgId: 'org-id',
        name: GITLAB_ORG_NAME,
        groupId: 'group-id',
        origName: GITLAB_ORG_NAME,
        integrations: {},
        sourceOrgId: 'source-org-id',
      },
    ];

    expect(
      generateTargetsImportDataFile(
        SupportedIntegrationTypesImportData.GITLAB,
        orgsData,
        GITLAB_BASE_URL,
      ),
    ).rejects.toThrow(
      'No targets could be generated. Check the error output & try again.',
    );
  }, 10000);
  it('Duplicate orgs are ignored', async () => {
    const GITLAB_BASE_URL = process.env.TEST_GITLAB_BASE_URL;
    const GITLAB_ORG_NAME = process.env.TEST_GITLAB_ORG_NAME as string;
    process.env.GITLAB_TOKEN = process.env.TEST_GITLAB_TOKEN;

    filesToDelete.push(path.resolve(__dirname + '/gitlab-import-targets.json'));
    const orgsData: CreatedOrg[] = [
      {
        orgId: 'org-id',
        name: GITLAB_ORG_NAME,
        groupId: 'group-id',
        origName: GITLAB_ORG_NAME,
        integrations: {
          gitlab: 'gitlab-********-********',
        },
        sourceOrgId: 'source-org-id',
      },

      // same again!
      {
        orgId: 'org-id',
        name: GITLAB_ORG_NAME,
        groupId: 'group-id',
        origName: GITLAB_ORG_NAME,
        integrations: {
          gitlab: 'gitlab-********-********',
        },
        sourceOrgId: 'source-org-id',
      },
    ];

    const res = await generateTargetsImportDataFile(
      SupportedIntegrationTypesImportData.GITLAB,
      orgsData,
      GITLAB_BASE_URL,
    );
    expect(res.fileName).toEqual('gitlab-import-targets.json');
    expect(res.targets.length > 0).toBeTruthy();
    expect(
      new Set(res.targets.map((t) => t.target.name)).size == res.targets.length,
    ).toBeTruthy();
    expect(res.targets[0]).toEqual({
      target: {
        id: expect.any(Number),
        branch: expect.any(String),
        name: expect.any(String),
        fork: expect.any(Boolean),
      },
      integrationId: expect.any(String),
      orgId: expect.any(String),
    });
  }, 10000);
});
