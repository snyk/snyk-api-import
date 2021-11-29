import { generateTargetId } from '../src/generate-target-id';

describe('generateTargetId', () => {
  it('correctly generates Gitlab target ID', () => {
    const orgId = 'org-public-id';
    const integrationId = 'integration-public-id';
    const target = {
      owner: 'snyk',
      branch: 'main',
      name: 'monorepo',
      id: 123,
    };
    const targetId = generateTargetId(orgId, integrationId, target);
    expect(targetId).toEqual(
      'org-public-id:integration-public-id:monorepo:snyk:main',
    );
  });

  it('correctly generates Github/Github Enterprise / Bitbucket Cloud / Azure Repos target ID', () => {
    const orgId = 'org-public-id';
    const integrationId = 'integration-public-id';
    const target = {
      owner: 'snyk',
      branch: 'main',
      name: 'monorepo',
    };
    const targetId = generateTargetId(orgId, integrationId, target);
    expect(targetId).toEqual(
      'org-public-id:integration-public-id:monorepo:snyk:main',
    );
  });

  it('correctly generates Heroku target ID', () => {
    const orgId = 'org-public-id';
    const integrationId = 'integration-public-id';
    const target = {
      slugId: 'slug-id',
      appId: 'app-id',
    };
    const targetId = generateTargetId(orgId, integrationId, target);
    expect(targetId).toEqual(
      'org-public-id:integration-public-id:app-id:slug-id',
    );
  });
  it('correctly generates Bitbucket Server target ID', () => {
    const orgId = 'org-public-id';
    const integrationId = 'integration-public-id';
    const target = {
      owner: 'snyk',
      projectKey: 'main',
      repoSlug: 'monorepo',
    };
    const targetId = generateTargetId(orgId, integrationId, target);
    expect(targetId).toEqual(
      'org-public-id:integration-public-id:main:monorepo:snyk',
    );
  });

  it('correctly generates CloudFoundry / Pivotal / IBM Cloud target ID', () => {
    const orgId = 'org-public-id';
    const integrationId = 'integration-public-id';
    const target = {
      appId: 'app-id',
    };
    const targetId = generateTargetId(orgId, integrationId, target);
    expect(targetId).toEqual('org-public-id:integration-public-id:app-id');
  });

  it('correctly generates Azure Container Registry, Elastic Container Registry, Artifactory Container Registry, Docker Hub  Cloud target ID', () => {
    const orgId = 'org-public-id';
    const integrationId = 'integration-public-id';
    const target = {
      name: 'some-custom-name',
    };
    const targetId = generateTargetId(orgId, integrationId, target);
    expect(targetId).toEqual(
      'org-public-id:integration-public-id:some-custom-name',
    );
  });

  it('correctly generates Azure Container Registry, Elastic Container Registry, Artifactory Container Registry, Docker Hub  Cloud target ID', () => {
    const orgId = 'org-public-id';
    const integrationId = 'integration-public-id';
    const target = {
      functionId: 'function-id',
    };
    const targetId = generateTargetId(orgId, integrationId, target);
    expect(targetId).toEqual('org-public-id:integration-public-id:function-id');
  });
});
