import * as path from 'path';
import { getImportProjectsFile } from '../../src/lib/get-import-path';

describe('getImportProjectsFile', () => {
  const OLD_ENV = process.env;
  afterEach(async () => {
    process.env = { ...OLD_ENV };
  });

  it('Full path resolves OK', () => {
    delete process.env.SNYK_IMPORT_PATH;
    const filePath = path.resolve(
      __dirname + '/fixtures/single-project/import-projects-single.json',
    );
    const pathToJsonFile = getImportProjectsFile(filePath);
    expect(pathToJsonFile).toMatch(
      '/fixtures/single-project/import-projects-single.json',
    );
  });

  it('Full path provided via env var resolves OK', () => {
    process.env.SNYK_IMPORT_PATH = path.resolve(
      __dirname + '/fixtures/single-project/import-projects-single.json',
    );
    const pathToJsonFile = getImportProjectsFile();
    expect(pathToJsonFile).toMatch(
      '/fixtures/single-project/import-projects-single.json',
    );
  });

  it('Relative path resolves ok', () => {
    const pathToJsonFile = getImportProjectsFile(
      './test/lib/fixtures/single-project/import-projects-single.json',
    );
    expect(pathToJsonFile).toMatch(
      '/fixtures/single-project/import-projects-single.json',
    );
  });

  it('Missing file name assumes: import-projects.json', () => {
    const filePath = path.resolve(__dirname + '/fixtures/single-project');
    const pathToJsonFile = getImportProjectsFile(filePath);
    expect(pathToJsonFile).toMatch(
      '/fixtures/single-project/import-projects.json',
    );
  });

  it('If path / file does not exist throws error', () => {
    expect(() => {
      getImportProjectsFile('/fixtures/non-existent.json');
    }).toThrow(
      "Please set the SNYK_IMPORT_PATH e.g. export SNYK_IMPORT_PATH='~/my/path/to/import-projects.json'",
    );
  });
});
