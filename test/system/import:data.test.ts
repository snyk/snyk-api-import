import { exec } from 'child_process';
import { sep, join } from 'path';
import { deleteFiles } from '../delete-files';
const main = './dist/index.js'.replace(/\//g, sep);

describe('`snyk-api-import import:data <...>`', () => {
  const OLD_ENV = process.env;
  afterAll(async () => {
    process.env = { ...OLD_ENV };
  });
  it('Shows help text as expected', (done) => {
    exec(
      `node ${main} import:data help`,
      {
        env: {
          PATH: process.env.PATH,
          GITHUB_TOKEN: process.env.GH_TOKEN,
          SNYK_LOG_PATH: __dirname,
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          throw err;
        }
        expect(err).toBeNull();
        expect(stderr).toEqual('');
        expect(stdout.trim()).toMatchSnapshot();
        done();
      },
    );
  });

  it('Generates repo data as expected for Gitlab', (done) => {
    const orgDataFile = 'test/system/fixtures/org-data/orgs.json';
    exec(
      `node ${main} import:data --source=gitlab --integrationType=gitlab --sourceUrl=${process.env.TEST_GITLAB_BASE_URL} --orgsData=${orgDataFile}`,
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
        expect(err).toBeNull();
        expect(stderr).toEqual('');
        expect(stdout.trim()).toMatch('Written the data to file');
        deleteFiles([join(__dirname, 'gitlab-import-targets.json')]);
        done();
      },
    );
  }, 20000);
  it('Shows error when missing ', (done) => {
    exec(`node ${main} import:data --source=github`, (err, stdout, stderr) => {
      expect(err).toMatchSnapshot();
      expect(stderr).toMatchSnapshot();
      expect(stdout).toEqual('');
      done();
    });
  });
});
