import * as _ from 'lodash';
import * as debugLib from 'debug';

import {
  CreatedOrg,
  ImportTarget,
  SupportedIntegrationTypesImportData,
} from '../lib/types';
import { writeFile } from '../write-file';
import {
  GithubRepoData,
  listGithubRepos,
  listGitlabRepos,
  GitlabRepoData,
  listAzureRepos,
  AzureRepoData,
  listBitbucketServerRepos,
  BitbucketServerRepoData,
  listBitbucketCloudRepos,
} from '../lib';

const debug = debugLib('snyk:generate-targets-data');

async function githubEnterpriseRepos(
  orgName: string,
  sourceUrl?: string,
): Promise<GithubRepoData[]> {
  if (!sourceUrl) {
    throw new Error(
      'Please provide required `sourceUrl` for Github Enterprise source',
    );
  }
  const ghRepos: GithubRepoData[] = await listGithubRepos(orgName, sourceUrl);
  return ghRepos;
}

const sourceGenerators = {
  [SupportedIntegrationTypesImportData.GITHUB]: listGithubRepos,
  [SupportedIntegrationTypesImportData.GHE]: githubEnterpriseRepos,
  [SupportedIntegrationTypesImportData.GITLAB]: listGitlabRepos,
  [SupportedIntegrationTypesImportData.AZURE_REPOS]: listAzureRepos,
  [SupportedIntegrationTypesImportData.BITBUCKET_SERVER]: listBitbucketServerRepos,
  [SupportedIntegrationTypesImportData.BITBUCKET_CLOUD]: listBitbucketCloudRepos,
};

function validateRequiredOrgData(
  name: string,
  integrations: {
    [name: string]: string;
  },
  orgId: string,
): void {
  if (!name) {
    throw new Error('Org field: `name` is required');
  }
  if (!orgId) {
    throw new Error('Org field: `orgId` is required');
  }
  if (!integrations || Object.keys(integrations).length < 1) {
    throw new Error(
      'Org field: `integrations` is required and must have at least 1 integration',
    );
  }

  if (
    _.intersection(
      Object.keys(integrations),
      Object.values(SupportedIntegrationTypesImportData),
    ).length === 0
  ) {
    throw new Error(
      'At least one supported integration is expected in `integrations` field.' +
        `Supported integrations are: ${Object.values(
          SupportedIntegrationTypesImportData,
        ).join(',')}`,
    );
  }
}

export async function generateTargetsImportDataFile(
  source: SupportedIntegrationTypesImportData,
  orgsData: CreatedOrg[],
  integrationType: SupportedIntegrationTypesImportData,
  sourceUrl?: string,
): Promise<{ targets: ImportTarget[]; fileName: string }> {
  const targetsData: ImportTarget[] = [];

  const orgsDataUnique = _.uniqBy(orgsData, 'orgId');
  for (const topLevelEntity of orgsDataUnique) {
    const { name, integrations, orgId } = topLevelEntity;
    debug(`Processing ${name}`);
    try {
      validateRequiredOrgData(name, integrations, orgId);
      const entities: Array<
        | GithubRepoData
        | GitlabRepoData
        | AzureRepoData
        | BitbucketServerRepoData
      > = await sourceGenerators[source](topLevelEntity.name, sourceUrl!);
      entities.forEach((entity) => {
        targetsData.push({
          target: entity,
          integrationId: integrations[integrationType],
          orgId,
        });
      });
    } catch (e) {
      console.error(
        `Failed to generate import data for org: ${name} (${orgId}). Error: ${e.message}`,
      );
    }
  }
  if (targetsData.length === 0) {
    throw new Error(
      'No targets could be generated. Check the error output & try again.',
    );
  }
  const fileName = `${source}-import-targets.json`;
  await writeFile(fileName, ({
    targets: targetsData,
  } as unknown) as JSON);
  return { targets: targetsData, fileName };
}
