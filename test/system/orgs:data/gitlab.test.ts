import { exec } from 'child_process';
import * as path from 'path';
import { deleteFiles } from '../../delete-files';
const main = './dist/index.js'.replace(/\//g, path.sep);

describe('General `snyk-api-import orgs:data <...>`', () => {
  const OLD_ENV = process.env;
  afterAll(() => {
    process.env = { ...OLD_ENV };
  });
  it('Generates orgs data as expected for Gitlab', (done) => {
    const groupId = 'hello';
    exec(
      `node ${main} orgs:data --source=gitlab --groupId=${groupId} --sourceUrl=${process.env.TEST_GITLAB_BASE_URL}`,
      {
        env: {
          PATH: process.env.PATH,
          GITLAB_TOKEN: process.env.TEST_GITLAB_TOKEN,
          SNYK_LOG_PATH: __dirname,
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          throw err;
        }
        expect(stderr).toEqual('');
        expect(err).toBeNull();
        expect(stdout).toMatch(
          'Found 15 group(s). Written the data to file: group-hello-gitlab-orgs.json',
        );
        deleteFiles([
          path.resolve(__dirname, `group-${groupId}-gitlab-orgs.json`),
        ]);
      },
    ).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  }, 30000);
});
