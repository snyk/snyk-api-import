import * as pMap from 'p-map';
import type {
  SnykOrgData} from '../lib/source-handlers/github';
import {
  githubEnterpriseOrganizations,
  githubOrganizationIsEmpty,
  githubOrganizations
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
  bitbucketServerProjectIsEmpty,
  listBitbucketServerProjects,
} from '../lib/source-handlers/bitbucket-server/';
import type { CreateOrgData } from '../lib/types';
import { SupportedIntegrationTypesImportOrgData } from '../lib/types';
import { writeFile } from '../write-file';

import {
  listBitbucketCloudAppWorkspaces,
  bitbucketCloudAppWorkspaceIsEmpty,
} from '../lib/source-handlers/bitbucket-cloud-app';

const sourceGenerators = {
  [SupportedIntegrationTypesImportOrgData.GITLAB]: listGitlabGroups,
  [SupportedIntegrationTypesImportOrgData.GITHUB]: githubOrganizations,
  [SupportedIntegrationTypesImportOrgData.GITHUB_CLOUD_APP]: listGitHubCloudAppOrgs,
  [SupportedIntegrationTypesImportOrgData.GHE]: githubEnterpriseOrganizations,
  [SupportedIntegrationTypesImportOrgData.BITBUCKET_SERVER]: listBitbucketServerProjects,
  [SupportedIntegrationTypesImportOrgData.BITBUCKET_CLOUD]: listBitbucketCloudWorkspaces,
  [SupportedIntegrationTypesImportOrgData.BITBUCKET_CLOUD_APP]: listBitbucketCloudAppWorkspaces,
};

const sourceNotEmpty = {
  [SupportedIntegrationTypesImportOrgData.GITHUB]: githubOrganizationIsEmpty,
  [SupportedIntegrationTypesImportOrgData.GITHUB_CLOUD_APP]: githubCloudAppOrganizationIsEmpty,
  [SupportedIntegrationTypesImportOrgData.GHE]: githubOrganizationIsEmpty,
  [SupportedIntegrationTypesImportOrgData.GITLAB]: gitlabGroupIsEmpty,
  [SupportedIntegrationTypesImportOrgData.BITBUCKET_SERVER]: bitbucketServerProjectIsEmpty,
  [SupportedIntegrationTypesImportOrgData.BITBUCKET_CLOUD]: bitbucketCloudWorkspaceIsEmpty,
  [SupportedIntegrationTypesImportOrgData.BITBUCKET_CLOUD_APP]: bitbucketCloudAppWorkspaceIsEmpty,
};

export const entityName: {
  [source in SupportedIntegrationTypesImportOrgData]: string;
} = {
  github: 'organization',
  'github-cloud-app': 'organization',
  'github-enterprise': 'organization',
  gitlab: 'group',
  'bitbucket-server': 'project',
  'bitbucket-cloud': 'workspace',
  'bitbucket-cloud-app': 'workspace',
};

const exportFileName: {
  [source in SupportedIntegrationTypesImportOrgData]: string;
} = {
  github: 'github-com',
  'github-cloud-app': 'github-cloud-app',
  'github-enterprise': 'github-enterprise',
  gitlab: 'gitlab',
  'bitbucket-server': 'bitbucket-server',
  'bitbucket-cloud': 'bitbucket-cloud',
  'bitbucket-cloud-app': 'bitbucket-cloud-app',
};

export async function generateOrgImportDataFile(
  source: SupportedIntegrationTypesImportOrgData,
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
  let topLevelEntities;
  if (source === SupportedIntegrationTypesImportOrgData.BITBUCKET_CLOUD_APP) {
    // Bitbucket Cloud App expects BitbucketAppConfig, not a string
    const clientId = process.env.BITBUCKET_APP_CLIENT_ID || '';
    const clientSecret = process.env.BITBUCKET_APP_CLIENT_SECRET || '';
    topLevelEntities = await sourceGenerators[source]({ clientId, clientSecret });
  } else {
    topLevelEntities = await sourceGenerators[source](sourceUrl ?? '');
  }

  await pMap(
    topLevelEntities,
    async (org) => {
      try {
        if (skipEmptyOrgs) {
          const isEmpty = await sourceNotEmpty[source](org.name, sourceUrl ?? '');
          if (isEmpty) {
            skippedEmptyOrgs.push(org);
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
