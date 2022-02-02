import { ImportTarget } from '../../../src/lib/types';
import { filterOutImportedTargets } from '../../../src/scripts/import-projects';

describe('filterOutImportedTargets', () => {
  it('filterOutImportedTargets skips Gitlab targets with ID as expected', async () => {
    const targets: ImportTarget[] = [
      {
        orgId: 'ORG_ID',
        integrationId: 'INTEGRATION_ID',
        // this is how the target is written during `import:data` command
        target: {
          name: 'snyk/debug',
          branch: 'develop',
          id: 123,
        },
        files: [{ path: 'package.json' }],
      },
    ];
    const loggingPath = `${__dirname}/fixtures/gitlab`;
    const filteredTargets = await filterOutImportedTargets(
      targets,
      loggingPath,
    );
    expect(filteredTargets).toEqual([]);
  });

  it('filterOutImportedTargets skips Gitlab targets without ID as expected', async () => {
    const targets: ImportTarget[] = [
      {
        orgId: 'ORG_ID',
        integrationId: 'INTEGRATION_ID',
        target: {
          // this is how the target is written during `import:data` command
          name: 'snyk/debug',
          branch: 'develop',
          id: 123,
        },
        files: [{ path: 'package.json' }],
      },
    ];
    const loggingPath = `${__dirname}/fixtures/gitlab/no-id`;
    const filteredTargets = await filterOutImportedTargets(
      targets,
      loggingPath,
    );
    // even though the log does not contain an ID and the import target does, we match the target
    expect(filteredTargets).toEqual([]);
  });

  it('filterOutImportedTargets returns all Gitlab targets when no import log found', async () => {
    const targets: ImportTarget[] = [
      {
        orgId: 'org-A',
        integrationId: 'integration-A',
        target: {
          name: 'debug',
          owner: 'snyk',
          branch: 'develop',
          id: 123,
        },
        files: [{ path: 'package.json' }],
      },
    ];
    const loggingPath = `${__dirname}/fixtures/non-existent`;
    const filteredTargets = await filterOutImportedTargets(
      targets,
      loggingPath,
    );
    expect(filteredTargets).toEqual(targets);
  });

  it('filterOutImportedTargets skips Bitbucket Server targets with projectKey and repoSlug as expected', async () => {
    const targets: ImportTarget[] = [
      {
        orgId: 'ORG_ID',
        integrationId: 'INTEGRATION_ID',
        // this is how the target is written during `import:data` command
        target: {
          projectKey: 'AT',
          repoSlug: 'GoofTest'
        },
        files: [{ path: 'package.json' }],
      },
    ];
    const loggingPath = `${__dirname}/fixtures/bitbucket-server`;
    const filteredTargets = await filterOutImportedTargets(
      targets,
      loggingPath,
    );
    expect(filteredTargets).toEqual([]);
  });

  it('filterOutImportedTargets returns all Bitbucket Server targets when no import log found', async () => {
    const targets: ImportTarget[] = [
      {
        orgId: 'org-A',
        integrationId: 'integration-A',
        target: {
          projectKey: 'AT',
          repoSlug: 'GoofTest'
        },
        files: [{ path: 'package.json' }],
      },
    ];
    const loggingPath = `${__dirname}/fixtures/bitbucket-server/non-existent`;
    const filteredTargets = await filterOutImportedTargets(
      targets,
      loggingPath,
    );
    expect(filteredTargets).toEqual(targets);
  });
});
