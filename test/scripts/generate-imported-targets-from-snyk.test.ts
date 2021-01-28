import * as fs from 'fs';

import { generateLogsPaths } from '../generate-log-file-names';
import { deleteFiles } from '../delete-files';
import { SupportedIntegrationTypes } from '../../src/lib/types';
import { generateSnykImportedTargets } from '../../src/scripts/generate-imported-targets-from-snyk';
import { IMPORT_LOG_NAME } from '../../src/common';

const ORG_ID = process.env.TEST_ORG_ID as string;
const SNYK_API_TEST = process.env.SNYK_API_TEST as string;
const GROUP_ID = process.env.TEST_GROUP_ID as string;

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('Generate imported targets based on Snyk data', () => {
  let logs: string[];
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;
  process.env.SNYK_LOG_PATH = __dirname;

  afterAll(async () => {
    await deleteFiles(logs);
    process.env = { ...OLD_ENV };
  });

  it('succeeds to generate targets for Group', async () => {
    const logFiles = generateLogsPaths(__dirname, ORG_ID);
    logs = Object.values(logFiles);
    const { targets, failedOrgs, fileName } = await generateSnykImportedTargets(
      GROUP_ID,
      SupportedIntegrationTypes.GITHUB,
    );
    expect(failedOrgs).toEqual([]);
    expect(fileName).toEqual(IMPORT_LOG_NAME);
    expect(targets[0]).toMatchObject({
      integrationId: expect.any(String),
      orgId: expect.any(String),
      target: {
        branch: expect.any(String),
        name: expect.any(String),
        owner: expect.any(String),
      },
    });
    const importedTargetsLog = fs.readFileSync(logFiles.importLogPath, 'utf8');
    // give file a little time to be finished to be written
    await new Promise((r) => setTimeout(r, 500));
    expect(importedTargetsLog).toMatch(targets[0].target.owner as string);
    expect(importedTargetsLog).toMatch(targets[0].orgId);
  }, 240000);
  it.todo('One org failed to be processed');
});
