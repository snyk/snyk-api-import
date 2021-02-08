import * as pMap from 'p-map';
import {
  githubEnterpriseOrganizations,
  githubOrganizationIsEmpty,
  githubOrganizations,
  SnykOrgData,
} from '../lib/source-handlers/github';
import {
  CreateOrgData,
  SupportedIntegrationTypesToGenerateImportData,
} from '../lib/types';
import { writeFile } from '../write-file';

const sourceGenerators = {
  [SupportedIntegrationTypesToGenerateImportData.GITHUB]: githubOrganizations,
  [SupportedIntegrationTypesToGenerateImportData.GHE]: githubEnterpriseOrganizations,
};

const sourceNotEmpty = {
  [SupportedIntegrationTypesToGenerateImportData.GITHUB]: githubOrganizationIsEmpty,
  [SupportedIntegrationTypesToGenerateImportData.GHE]: githubOrganizationIsEmpty,
};

export const entityName: {
  [source in SupportedIntegrationTypesToGenerateImportData]: string;
} = {
  github: 'organization',
  'github-enterprise': 'organization',
};

export async function generateOrgImportDataFile(
  source: SupportedIntegrationTypesToGenerateImportData,
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
  const topLevelEntities = await sourceGenerators[source](sourceUrl);

  await pMap(
    topLevelEntities,
    async (org) => {
      try {
        if (skipEmptyOrgs) {
          const isEmpty = await sourceNotEmpty[source](org.name, sourceUrl);
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

  const fileName = `group-${groupId}-${
    sourceUrl ? 'github-enterprise' : 'github-com'
  }-orgs.json`;
  await writeFile(fileName, ({
    orgs: orgData,
  } as unknown) as JSON);
  return { orgs: orgData, fileName, skippedEmptyOrgs };
}
