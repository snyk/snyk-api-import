import { CreateOrgData } from '../lib/types';
import { writeFile } from '../write-file';
import { GithubOrgData, listGithubOrgs } from './github';

export enum Sources {
  GITHUB = 'github',
}

async function githubOrganizations(): Promise<{ name: string }[]> {
  const ghOrgs: GithubOrgData[] = await listGithubOrgs();
  return ghOrgs;
}

const sourceGenerators = {
  [Sources.GITHUB]: githubOrganizations,
};

export async function generateOrgImportDataFile(
  source: Sources,
  groupId: string,
  sourceOrgId?: string,
): Promise<{ orgs: CreateOrgData[]; fileName: string }> {
  const orgData: CreateOrgData[] = [];

  const toplevelEntities = await sourceGenerators[source]();

  for (const org in toplevelEntities) {
    const data: CreateOrgData = {
      name: toplevelEntities[org].name,
      groupId,
    };
    if (sourceOrgId) {
      data.sourceOrgId = sourceOrgId;
    }
    orgData.push(data);
  }
  const fileName = `group-${groupId}-github-com-orgs.json`;
  await writeFile(fileName, ({
    orgs: orgData,
  } as unknown) as JSON);
  return { orgs: orgData, fileName };
}
