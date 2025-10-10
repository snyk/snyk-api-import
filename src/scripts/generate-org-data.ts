import * as pMap from 'p-map';
import type { SnykOrgData } from '../lib/source-handlers/github';
import {
  githubEnterpriseOrganizations,
  githubOrganizationIsEmpty,
  githubOrganizations,
} from '../lib/source-handlers/github';
import {
  listGitHubCloudAppOrgs,
  githubCloudAppOrganizationIsEmpty,
} from '../lib/source-handlers/github-cloud-app';
import {
  listGitlabGroups,
  gitlabGroupIsEmpty,
} from '../lib/source-handlers/gitlab';
import {
  bitbucketCloudWorkspaceIsEmpty,
  listBitbucketCloudWorkspaces,
} from '../lib/source-handlers/bitbucket-cloud/';
import {
  bitbucketCloudAppWorkspaceIsEmpty,
  listBitbucketCloudAppWorkspaces,
} from '../lib/source-handlers/bitbucket-cloud-app';
import {
  bitbucketServerProjectIsEmpty,
  listBitbucketServerProjects,
} from '../lib/source-handlers/bitbucket-server/';
import type { CreateOrgData } from '../lib/types';
import type { SupportedIntegrationTypesImportOrgData } from '../lib/types';
import { writeFile } from '../write-file';
export const sourceGenerators: {
  [key in
    | SupportedIntegrationTypesImportOrgData
    | 'github-cloud-app'
    | 'bitbucket-cloud-app']: (url: string) => Promise<any[]>;
} = {
  github: githubOrganizations,
  'github-cloud-app': listGitHubCloudAppOrgs,
  'github-enterprise': githubEnterpriseOrganizations,
  gitlab: listGitlabGroups,
  'bitbucket-server': listBitbucketServerProjects,
  'bitbucket-cloud': listBitbucketCloudWorkspaces,
  'bitbucket-cloud-app': listBitbucketCloudAppWorkspaces,
};

export const sourceNotEmpty: {
  [key in
    | SupportedIntegrationTypesImportOrgData
    | 'github-cloud-app'
    | 'bitbucket-cloud-app']: (...args: any[]) => Promise<boolean>;
} = {
  github: githubOrganizationIsEmpty,
  'github-cloud-app': githubCloudAppOrganizationIsEmpty,
  'github-enterprise': githubOrganizationIsEmpty,
  gitlab: gitlabGroupIsEmpty,
  'bitbucket-server': bitbucketServerProjectIsEmpty,
  'bitbucket-cloud': (...args: any[]) =>
    bitbucketCloudWorkspaceIsEmpty(args[0], args[1]),
  'bitbucket-cloud-app': (...args: any[]) =>
    bitbucketCloudAppWorkspaceIsEmpty(args[0], args[1]),
};

export const entityName: {
  [key in
    | SupportedIntegrationTypesImportOrgData
    | 'github-cloud-app'
    | 'bitbucket-cloud-app']: string;
} = {
  github: 'organization',
  'github-cloud-app': 'organization',
  'github-enterprise': 'organization',
  gitlab: 'group',
  'bitbucket-server': 'project',
  'bitbucket-cloud': 'workspace',
  'bitbucket-cloud-app': 'workspace',
};

export const exportFileName: {
  [key in
    | SupportedIntegrationTypesImportOrgData
    | 'github-cloud-app'
    | 'bitbucket-cloud-app']: string;
} = {
  github: 'github-com',
  'github-cloud-app': 'github-cloud-app',
  'github-enterprise': 'github-enterprise',
  gitlab: 'gitlab',
  'bitbucket-server': 'bitbucket-server',
  'bitbucket-cloud': 'bitbucket-cloud',
  'bitbucket-cloud-app': 'bitbucket-cloud-app',
};

export async function generateOrgData(
  source:
    | SupportedIntegrationTypesImportOrgData
    | 'github-cloud-app'
    | 'bitbucket-cloud-app',
  groupId: string,
  sourceOrgId?: string,
  sourceUrl?: string,
  skipEmptyOrgs = false,
): Promise<{
  orgs: CreateOrgData[];
  fileName: string;
  skippedEmptyOrgs: SnykOrgData[];
}> {
  const orgData: CreateOrgData[] = [];
  const skippedEmptyOrgs: SnykOrgData[] = [];
  const topLevelEntities = await sourceGenerators[source](sourceUrl ?? '');

  await pMap(
    topLevelEntities,
    async (org: any) => {
      try {
        if (skipEmptyOrgs) {
          let isEmpty: boolean;
          if (source === 'bitbucket-cloud') {
            // For bitbucket-cloud, pass config and workspace
            isEmpty = await sourceNotEmpty[source](org, sourceUrl ?? '');
          } else {
            isEmpty = await sourceNotEmpty[source](org.name, sourceUrl ?? '');
          }
          if (isEmpty) {
            skippedEmptyOrgs.push(org as SnykOrgData);
            throw new Error(`Skipping empty ${entityName[source]} ${org.name}`);
          }
        }
        const data: CreateOrgData = {
          name: org.name,
          groupId,
        };
        if (sourceOrgId) {
          data.sourceOrgId = sourceOrgId;
        }
        orgData.push(data);
      } catch (e) {
        console.warn(e.message);
      }
    },
    { concurrency: 10 },
  );

  const fileName = `group-${groupId}-${exportFileName[source]}-orgs.json`;
  await writeFile(fileName, {
    orgs: orgData,
  } as unknown as JSON);
  return { orgs: orgData, fileName, skippedEmptyOrgs };
}
