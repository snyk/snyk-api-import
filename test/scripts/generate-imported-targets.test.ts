import * as path from 'path';
import * as fs from 'fs';

import { generateSnykImportedTargets } from '../../src/scripts/generate-snyk-imported-targets';
import { generateLogsPaths } from '../generate-log-file-names';
import { deleteFiles } from '../delete-files';
import { SupportedIntegrationTypes } from '../../src/lib/types';

const ORG_ID = process.env.TEST_ORG_ID as string;
const SNYK_API_TEST = process.env.SNYK_API_TEST as string;

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('Generate imported targets based on Snyk data', () => {
  let logs: string[];
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;

  afterAll(async () => {
    // await deleteFiles(logs);
    process.env = { ...OLD_ENV };
  });

  it('succeeds to generate targets for Group', async () => {
    const logFiles = generateLogsPaths(__dirname, ORG_ID);
    logs = Object.values(logFiles);
    const GROUP_ID = 'd64abc45-b39a-48a2-9636-a4f62adbf09a';
    const { targets } = await generateSnykImportedTargets(
      GROUP_ID,
      SupportedIntegrationTypes.GITHUB,
    );
    expect(targets).toBe({});
  }, 240000);
});
