import * as path from 'path';
import * as fs from 'fs';

import {
  importTarget,
  pollImportUrl,
  importTargets,
  pollImportUrls,
  deleteProjects,
} from '../../src/lib';
import { Project } from '../../src/lib/types';
import {
  IMPORT_LOG_NAME,
  FAILED_LOG_NAME,
  FAILED_PROJECTS_LOG_NAME,
} from '../../src/common';

const ORG_ID = 'f0125d9b-271a-4b50-ad23-80e12575a1bf';
const GITHUB_INTEGRATION_ID = 'c4de291b-e083-4c43-a72c-113463e0d268';

function generateLogsPaths(
  logPath: string,
): {
  importLogPath: string;
  failedImportLogPath: string;
  failedProjectsLogPath: string;
  // projectsLogPath: string;
  pollingUrlsLogPath: string;
} {
  process.env.SNYK_LOG_PATH = logPath;
  const importLogPath = path.resolve(logPath, IMPORT_LOG_NAME);
  const failedImportLogPath = path.resolve(logPath, FAILED_LOG_NAME);
  const failedProjectsLogPath = path.resolve(logPath, FAILED_PROJECTS_LOG_NAME);
  const pollingUrlsLogPath = path.resolve(logPath, `${ORG_ID}.log`);

  return {
    importLogPath,
    failedImportLogPath,
    failedProjectsLogPath,
    pollingUrlsLogPath,
  };
}

async function deleteTestProjects(
  discoveredProjects: Project[],
): Promise<void> {
  const projectIds: string[] = [];
  discoveredProjects.forEach(async (project) => {
    if (project.projectUrl) {
      const projectId = project.projectUrl.split('/').slice(-1)[0];
      projectIds.push(projectId);
    }
  });
  await deleteProjects(ORG_ID, projectIds);
}

describe('Single target', () => {
  const OLD_ENV = process.env;

  const discoveredProjects: Project[] = [];
  const logsFiles = generateLogsPaths(__dirname);
  it('Import & poll a repo', async () => {
    const { pollingUrl } = await importTarget(
      ORG_ID,
      GITHUB_INTEGRATION_ID,
      {
        name: 'shallow-goof-policy',
        owner: 'snyk-fixtures',
        branch: 'master',
      },
      undefined,
      __dirname,
    );
    expect(pollingUrl).not.toBeNull();
    const projects = await pollImportUrl(pollingUrl);
    expect(projects[0]).toMatchObject({
      projectUrl: expect.any(String),
      success: true,
      targetFile: expect.any(String),
    });

    const pollingUrlLogContent = fs.readFileSync(logsFiles.pollingUrlsLogPath, 'utf-8');
    expect(pollingUrlLogContent).not.toBeNull();
    // cleanup
    discoveredProjects.push(...projects);
  }, 30000000);
  afterAll(async () => {
    Object.values(logsFiles).forEach((path) => {
      try {
        fs.unlinkSync(path);
      } catch (e) {
        // do nothing
      }
    });
    process.env = { ...OLD_ENV };
    await deleteTestProjects(discoveredProjects);
  });
});

describe('Multiple targets', () => {
  const discoveredProjects: Project[] = [];
  it('importTargets &  pollImportUrls multiple repos', async () => {
    const pollingUrls = await importTargets([
      {
        orgId: ORG_ID,
        integrationId: GITHUB_INTEGRATION_ID,
        target: {
          name: 'shallow-goof-policy',
          owner: 'snyk-fixtures',
          branch: 'master',
        },
      },
      {
        orgId: ORG_ID,
        integrationId: GITHUB_INTEGRATION_ID,
        target: {
          name: 'ruby-with-versions',
          owner: 'snyk-fixtures',
          branch: 'master',
        },
      },
      {
        orgId: ORG_ID,
        integrationId: GITHUB_INTEGRATION_ID,
        target: {
          name: 'composer-with-vulns',
          owner: 'snyk-fixtures',
          branch: 'master',
        },
      },
    ]);
    expect(pollingUrls.length >= 1).toBeTruthy();
    const projects = await pollImportUrls(pollingUrls);
    // at least one job successfully finished
    expect(projects[0]).toMatchObject({
      projectUrl: expect.any(String),
      success: true,
      targetFile: expect.any(String),
    });
    // cleanup
    discoveredProjects.push(...projects);
  }, 30000000);
  afterAll(async () => {
    await deleteTestProjects(discoveredProjects);
  });
});

test.todo('Failed import 100%');
test.todo('Only 1 import fails out of a few + logs created');

describe('Polling', () => {
  it.todo('Logs failed polls');
});
