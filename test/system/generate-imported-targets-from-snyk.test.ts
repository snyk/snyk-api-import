import { exec } from 'child_process';
import * as path from 'path';
import { sep } from 'path';
import { IMPORT_LOG_NAME } from '../../src/common';
import { deleteFiles } from '../delete-files';
const main = './dist/index.js'.replace(/\//g, sep);

describe('`snyk-api-import list:imported <...>`', () => {
  const OLD_ENV = process.env;
  process.env.GITHUB_TOKEN = process.env.GH_TOKEN;

  afterAll(async () => {
    process.env = { ...OLD_ENV };
  });
  it('Shows help text as expected', async (done) => {
    return exec(`node ${main} list:imported help`, (err, stdout) => {
      if (err) {
        throw err;
      }
      expect(err).toBeNull();
      expect(stdout.trim()).toMatchSnapshot();
      done();
    });
  });

  it('Generates Snyk imported targets data as expected', async (done) => {
    return exec(
      `node ${main} list:imported --integrationType=github --groupId=${process.env.TEST_GROUP_ID}`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_LOG_PATH: __dirname,
        },
      },
      (err, stdout) => {
        if (err) {
          throw err;
        }
        expect(err).toBeNull();
        expect(stdout.trim()).toMatch(
          `repo(s). Written the data to file: ${path.resolve(
            __dirname,
            'imported-targets.log',
          )}`,
        );
        deleteFiles([path.resolve(__dirname, IMPORT_LOG_NAME)]);
        done();
      },
    );
  }, 10000);
  it('Shows error when missing groupId', async (done) => {
    return exec(
      `node ${main} list:imported --integrationType=github`,
      (err, stdout) => {
        expect(err).toMatchSnapshot();
        expect(stdout).toEqual('');
        done();
      },
    );
  });
});
