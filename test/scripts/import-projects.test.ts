import * as path from 'path';
import * as fs from 'fs';
import { ImportProjects } from '../../src/scripts/import-projects';
import { IMPORT_PROJECTS_FILE_NAME, IMPORT_LOG_NAME } from '../../src/common';

describe('Import projects script', () => {
  const logPath = path.resolve(__dirname, IMPORT_LOG_NAME);
  afterEach(() => {
    fs.unlinkSync(logPath);
  });
  it.only('succeeds to import targets from file', async () => {
    const projects = await ImportProjects(
      path.resolve(__dirname + `/fixtures/${IMPORT_PROJECTS_FILE_NAME}`),
      __dirname,
    );
    expect(projects).not.toBe([]);
    expect(projects[0]).toMatchObject({
      projectUrl: expect.any(String),
      success: true,
      targetFile: expect.any(String),
    });
    const logFile = fs.readFileSync(logPath, 'utf8');
    expect(logFile).toMatch('shallow-goof-policy');
    expect(logFile).toMatch('composer-with-vulns');
    expect(logFile).toMatch('ruby-with-versions:');
  }, 30000000);
});

describe('Import skips previously imported', () => {
  const logPath = path.resolve(
    __dirname + '/fixtures/with-import-log',
    IMPORT_LOG_NAME,
  );
  it('succeeds to import targets from file', async () => {
    const projects = await ImportProjects(
      path.resolve(
        __dirname + `/fixtures/with-import-log/${IMPORT_PROJECTS_FILE_NAME}`,
      ),
      __dirname + '/fixtures/with-import-log',
    );
    expect(projects.length === 0).toBeTruthy();
    const logFile = fs.readFileSync(logPath, 'utf8');
    expect(logFile).toMatchSnapshot();
  }, 30000000);
});

describe('Skips issues', () => {
  const logPath = path.resolve(__dirname, IMPORT_LOG_NAME);
  it('Skips any badly formatted targets', async () => {
    // TODO: ensure all failures are logged & assert it is present in the log
    const projects = await ImportProjects(
      path.resolve(__dirname + '/fixtures/import-projects-invalid-target.json'),
      __dirname,
    );
    expect(projects.length === 0).toBeTruthy();
    let logFile = null;
    try {
      logFile = fs.readFileSync(logPath, 'utf8');
    } catch (e) {
      expect(logFile).toBeNull();
    }
  }, 300);
});

describe('Error handling', () => {
  it('shows correct error when input can not be loaded', async () => {
    expect(
      ImportProjects(`do-not-exist/${IMPORT_PROJECTS_FILE_NAME}`),
    ).rejects.toThrow('File can not be found at location');
  }, 300);
  it('shows correct error when input is invalid json', async () => {
    expect(
      ImportProjects(
        path.resolve(__dirname + '/fixtures/import-projects-invalid.json'),
      ),
    ).rejects.toThrow('Failed to parse targets from');
  }, 300);
});
