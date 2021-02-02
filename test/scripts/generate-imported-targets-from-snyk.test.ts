import * as fs from 'fs';
import * as path from 'path';

import { generateLogsPaths } from '../generate-log-file-names';
import { deleteFiles } from '../delete-files';
import {
  generateSnykImportedTargets,
  projectToTarget,
} from '../../src/scripts/generate-imported-targets-from-snyk';
import { IMPORT_LOG_NAME } from '../../src/common';
import { SupportedIntegrationTypesToListSnykTargets } from '../../src/lib/types';

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
      SupportedIntegrationTypesToListSnykTargets.GITHUB,
    );
    expect(failedOrgs).toEqual([]);
    expect(fileName).toEqual(path.resolve(__dirname, IMPORT_LOG_NAME));
    expect(targets[0]).toMatchObject({
      integrationId: expect.any(String),
      orgId: expect.any(String),
      target: {
        branch: expect.any(String),
        name: expect.any(String),
        owner: expect.any(String),
      },
    });
    // give file a little time to be finished to be written
    await new Promise((r) => setTimeout(r, 20000));
    const importedTargetsLog = fs.readFileSync(logFiles.importLogPath, 'utf8');
    expect(importedTargetsLog).toMatch(targets[0].target.owner as string);
    expect(importedTargetsLog).toMatch(targets[0].orgId);
    expect(importedTargetsLog).toMatch(targets[0].integrationId);
  }, 240000);
  it.todo('One org failed to be processed');

  it('succeed to convert Github project name to target', async () => {
    const project = {
      name: 'lili-snyk/huge-monorepo:cockroach/build/builder/Dockerfile',
      branch: 'main',
    };
    const target = projectToTarget(project);
    expect(target).toEqual({
      branch: 'main',
      name: 'huge-monorepo',
      owner: 'lili-snyk',
    });
  });
});
