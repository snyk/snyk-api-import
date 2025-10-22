import { intersection, uniqBy } from 'lodash';
import * as debugLib from 'debug';

import type { CreatedOrg, ImportTarget } from '../lib/types';
import { SupportedIntegrationTypesImportData } from '../lib/types';
import { writeFile } from '../write-file';
import type {
  GithubRepoData,
  GitlabRepoData,
  AzureRepoData,
  BitbucketServerRepoData,
  BitbucketCloudRepoData,
  BitbucketRepoData,
} from '../lib';
import {
  listGithubRepos,
  listGitlabRepos,
  listAzureRepos,
  listBitbucketServerRepos,
} from '../lib';
import { listIntegrations } from '../lib/api/org';
import { requestsManager } from 'snyk-request-manager';
import { listRepos as listBitbucketCloudRepos } from '../lib/source-handlers/bitbucket-cloud/list-repos';
import type { BitbucketCloudAuthConfig } from '../lib/source-handlers/bitbucket-cloud/types';
import { listGitHubCloudAppRepos } from '../lib/source-handlers/github-cloud-app';

const debug = debugLib('snyk:generate-targets-data');

async function githubEnterpriseRepos(
  orgName: string,
  sourceUrl?: string,
): Promise<GithubRepoData[]> {
  if (!sourceUrl) {
    console.warn(
      'No `sourceUrl` provided for Github Enterprise source, defaulting to https://api.github.com',
    );
  }
  const ghRepos: GithubRepoData[] = await listGithubRepos(orgName, sourceUrl);
  return ghRepos;
}

const sourceGenerators = {
  [SupportedIntegrationTypesImportData.GITHUB]: listGithubRepos,
  [SupportedIntegrationTypesImportData.GITHUB_CLOUD_APP]:
    listGitHubCloudAppRepos,
  [SupportedIntegrationTypesImportData.GHE]: githubEnterpriseRepos,
  [SupportedIntegrationTypesImportData.GITLAB]: listGitlabRepos,
  [SupportedIntegrationTypesImportData.AZURE_REPOS]: listAzureRepos,
  [SupportedIntegrationTypesImportData.BITBUCKET_SERVER]:
    listBitbucketServerRepos,
  [SupportedIntegrationTypesImportData.BITBUCKET_CLOUD]:
    listBitbucketCloudRepos,
  // BITBUCKET_CLOUD_APP is handled explicitly in the generation logic below
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
    intersection(
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
  sourceUrl?: string,
): Promise<{ targets: ImportTarget[]; fileName: string }> {
  const targetsData: ImportTarget[] = [];

  const orgsDataUnique = uniqBy(orgsData, 'orgId');
  for (const topLevelEntity of orgsDataUnique) {
    const { name, integrations, orgId } = topLevelEntity;
    debug(`Processing ${name}`);
    try {
      validateRequiredOrgData(name, integrations, orgId);
      let entities: Array<
        | GithubRepoData
        | GitlabRepoData
        | AzureRepoData
        | BitbucketServerRepoData
        | BitbucketCloudRepoData
        | BitbucketRepoData
      > = [];
      if (source === SupportedIntegrationTypesImportData.BITBUCKET_CLOUD) {
        // legacy non-app flow: prefer username/app-password (interactive
        // and many listing endpoints require Basic auth with an app
        // password). Fall back to API or OAuth tokens if user creds are
        // not available.
        let config: BitbucketCloudAuthConfig;
        if (process.env.BITBUCKET_CLOUD_USERNAME && process.env.BITBUCKET_CLOUD_PASSWORD) {
          config = {
            type: 'user',
            username: process.env.BITBUCKET_CLOUD_USERNAME!,
            password: process.env.BITBUCKET_CLOUD_PASSWORD!,
          };
        } else if (process.env.BITBUCKET_CLOUD_API_TOKEN) {
          config = {
            type: 'api',
            token: process.env.BITBUCKET_CLOUD_API_TOKEN!,
          };
        } else if (process.env.BITBUCKET_CLOUD_OAUTH_TOKEN) {
          config = {
            type: 'oauth',
            token: process.env.BITBUCKET_CLOUD_OAUTH_TOKEN!,
          };
        } else {
          throw new Error('No Bitbucket Cloud authentication env vars found for generating targets data. Please set BITBUCKET_CLOUD_USERNAME and BITBUCKET_CLOUD_PASSWORD, or BITBUCKET_CLOUD_API_TOKEN, or BITBUCKET_CLOUD_OAUTH_TOKEN.');
        }
        entities = await listBitbucketCloudRepos(config, topLevelEntity.name);
      } else if (
        source === SupportedIntegrationTypesImportData.BITBUCKET_CLOUD_APP
      ) {
        // app flow: use client credentials (BITBUCKET_APP_CLIENT_ID/SECRET)
        const { listBitbucketCloudAppRepos } = await import(
          '../lib/source-handlers/bitbucket-cloud-app/list-repos'
        );
        entities = await listBitbucketCloudAppRepos(topLevelEntity.name);
      } else {
        entities = await sourceGenerators[source](
          topLevelEntity.name,
          sourceUrl!,
        );
      }
      // ensure we have an integrationId; if missing, try to query Snyk for this org
      let integrationId = integrations[source];
      if (!integrationId) {
        try {
          const rm = new requestsManager({
            userAgentPrefix: 'snyk-api-import:generate-targets-data',
          });
          const res = await listIntegrations(rm, orgId);
          integrationId = res[source];
          debug(
            `Looked up integrationId for org ${orgId} source ${source}: ${integrationId}`,
          );
        } catch (err) {
          debug(
            `Failed to lookup integrations for org ${orgId}: ${
              err && err.message ? err.message : err
            }`,
          );
        }
      }

      entities.forEach((entity) => {
        targetsData.push({
          target: entity,
          integrationId,
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
  await writeFile(fileName, {
    targets: targetsData,
  } as unknown as JSON);
  return { targets: targetsData, fileName };
}
