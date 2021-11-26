import { ImportTarget } from '../../../src/lib/types';
import { filterOutImportedTargets } from '../../../src/scripts/import-projects';

describe('filterOutImportedTargets', () => {
  it('filterOutImportedTargets skips Gitlab targets with ID as expected', async () => {
    const targets: ImportTarget[] = [
      {
        orgId: 'ORG_ID',
        integrationId: 'INTEGRATION_ID',
        target: {
          name: 'debug',
          owner: 'snyk',
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
});
