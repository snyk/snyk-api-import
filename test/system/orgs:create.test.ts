import { exec } from 'child_process';
import * as path from 'path';
const main = './dist/index.js'.replace(/\//g, path.sep);

describe('`snyk-api-import help <...>`', () => {
  const OLD_ENV = process.env;

  afterAll(async () => {
    process.env = { ...OLD_ENV };
  });
  it('Shows help text as expected', async (done) => {
    return exec(`node ${main} orgs:create help`, (err, stdout) => {
      if (err) {
        throw err;
      }
      expect(err).toBeNull();
      expect(stdout.trim()).toMatchSnapshot();
      done();
    });
  });
  it('Fails to create an org as expected', async (done) => {
    const pathToBadJson = path.resolve(
      __dirname + '/fixtures/create-orgs/fails-to-create/1-org.json',
    );
    const logPath = path.resolve(
      __dirname + '/fixtures/create-orgs/fails-to-create/',
    );

    return exec(
      `node ${main} orgs:create --file=${pathToBadJson}`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_LOG_PATH: logPath,
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          throw err;
        }
        expect(stderr).toMatch('All requested organizations failed to be created. Review the errors in');
        expect(err).toBeNull();
        expect(stdout).toEqual('');
        done();
      },
    );
  });

  it('Fail to create orgs in strict mode when org already exists ', async (done) => {
    const pathToBadJson = path.resolve(
      __dirname + '/fixtures/create-orgs/fails-to-create/1-org.json',
    );
    const logPath = path.resolve(
      __dirname + '/fixtures/create-orgs/fails-to-create/',
    );
    return exec(
      `node ${main} orgs:create --file=${pathToBadJson} --noDuplicateNames`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_LOG_PATH: logPath,
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          throw err;
        }
        expect(stderr).toMatch('All requested organizations failed to be created. Review the errors in');
        expect(err).toBeNull();
        expect(stdout).toEqual('');
        done();
      },
    );
  });
});
