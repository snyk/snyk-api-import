import * as path from 'path';
import { ImportProjects } from '../../src/scripts/import-projects';

// TODO: after all delete the new projects
describe('Import projects script', () => {
  it('succeeds to import targets from file', async () => {
    const projects = await ImportProjects(
      path.resolve(__dirname + '/fixtures/import-projects.json'),
    );
    expect(projects).not.toBe([]);
    expect(projects[0]).toMatchObject({
      projectUrl: expect.any(String),
      success: true,
      targetFile: expect.any(String),
    });
  }, 30000000);
  it('shows correct error when input can not be loaded', async () => {
    expect(ImportProjects('do-not-exist/import-projects.json')).rejects.toThrow(
      'File can not be found at location',
    );
  }, 300);
  it('shows correct error when input is invalid json', async () => {
    expect(
      ImportProjects(
        path.resolve(__dirname + '/fixtures/import-projects-invalid.json'),
      ),
    ).rejects.toThrow('Failed to parse targets from');
  }, 300);
  it('Skips any badly formatted targets', async () => {
    // TODO: ensure all failures are logged & assert it is present in the log
    const projects = await ImportProjects(
      path.resolve(__dirname + '/fixtures/import-projects-invalid-target.json'),
    );
    expect(projects.length).toBe(0);
  }, 300);
});
