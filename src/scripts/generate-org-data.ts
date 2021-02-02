import {
  CreateOrgData,
  SupportedIntegrationTypesToGenerateImportData,
} from '../lib/types';
import { writeFile } from '../write-file';
import { GithubOrgData, listGithubOrgs } from './github';

async function githubEnterpriseOrganizations(
  sourceUrl?: string,
): Promise<{ name: string }[]> {
  if (!sourceUrl) {
    throw new Error(
      'Please provide required `sourceUrl` for Github Enterprise source',
    );
  }
  const ghOrgs: GithubOrgData[] = await listGithubOrgs(sourceUrl);
  return ghOrgs;
}

async function githubOrganizations(): Promise<{ name: string }[]> {
  const ghOrgs: GithubOrgData[] = await listGithubOrgs();
  return ghOrgs;
}

const sourceGenerators = {
  [SupportedIntegrationTypesToGenerateImportData.GITHUB]: githubOrganizations,
  [SupportedIntegrationTypesToGenerateImportData.GHE]: githubEnterpriseOrganizations,
};

export async function generateOrgImportDataFile(
  source: SupportedIntegrationTypesToGenerateImportData,
  groupId: string,
  sourceOrgId?: string,
  sourceUrl?: string,
): Promise<{ orgs: CreateOrgData[]; fileName: string }> {
  const orgData: CreateOrgData[] = [];

  const topLevelEntities = await sourceGenerators[source](sourceUrl);

  for (const organization in topLevelEntities) {
    const data: CreateOrgData = {
      name: topLevelEntities[organization].name,
      groupId,
    };
    if (sourceOrgId) {
      data.sourceOrgId = sourceOrgId;
    }
    orgData.push(data);
  }
  const fileName = `group-${groupId}-${
    sourceUrl ? 'github-enterprise' : 'github-com'
  }-orgs.json`;
  await writeFile(fileName, ({
    orgs: orgData,
  } as unknown) as JSON);
  return { orgs: orgData, fileName };
}
