import * as fs from 'fs';
import { exec } from 'child_process';
import * as path from 'path';
import { FAILED_ORG_LOG_NAME } from '../../src/common';
import { deleteFiles } from '../delete-files';
const main = './dist/index.js'.replace(/\//g, path.sep);

describe('`snyk-api-import help <...>`', () => {
  const OLD_ENV = process.env;
  const GROUP_ID = process.env.TEST_GROUP_ID as string;

  afterAll(async () => {
    process.env = { ...OLD_ENV };
  });
  it('Shows help text as expected', (done) => {
    exec(`node ${main} orgs:create help`, (err, stdout) => {
      if (err) {
        throw err;
      }
      expect(err).toBeNull();
      expect(stdout.trim()).toMatchSnapshot();
    }).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  }, 10000);
  it('Fails to create an org as expected for non existing group ID `abc`', (done) => {
    const pathToBadJson = path.resolve(
      __dirname + '/fixtures/create-orgs/fails-to-create/1-org.json',
    );
    const logPath = path.resolve(
      __dirname + '/fixtures/create-orgs/fails-to-create/',
    );

    exec(
      `node ${main} orgs:create --file=${pathToBadJson} --noDuplicateNames --no-includeExistingOrgsInOutput`,
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
        expect(stderr).toMatch(
          'All requested organizations failed to be created. Review the errors in',
        );
        expect(err).toBeNull();
        expect(stdout).toEqual('');
        const file = fs.readFileSync(
          path.resolve(logPath, `abc.${FAILED_ORG_LOG_NAME}`),
          'utf8',
        );
        expect(file).toContain('Please provide the group public id');
        deleteFiles([path.resolve(logPath, `abc.${FAILED_ORG_LOG_NAME}`)]);
      },
    ).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  }, 10000);

  it('Fails to create an org as expected for non existing group ID `abc` file not in the same location as logs', (done) => {
    const pathToBadJson = path.resolve(
      __dirname + '/fixtures/create-orgs/fails-to-create/1-org.json',
    );
    const logPath = path.resolve(
      __dirname + '/fixtures/create-orgs/fails-to-create-logPath/',
    );

    exec(
      `node ${main} orgs:create --file=${pathToBadJson} --noDuplicateNames --no-includeExistingOrgsInOutput`,
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
        expect(stderr).toMatch(
          'All requested organizations failed to be created. Review the errors in',
        );
        expect(err).toBeNull();
        expect(stdout).toEqual('');
        const file = fs.readFileSync(
          path.resolve(logPath, `abc.${FAILED_ORG_LOG_NAME}`),
          'utf8',
        );
        expect(file).toContain('Please provide the group public id');
        deleteFiles([path.resolve(logPath, `abc.${FAILED_ORG_LOG_NAME}`)]);
      },
    ).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  }, 10000);

  it('Fails to create orgs in --noDuplicateNames mode when org already exists ', (done) => {
    const pathToBadJson = path.resolve(
      __dirname +
        '/fixtures/create-orgs/fails-to-create/already-exists/1-org.json',
    );
    const logPath = path.resolve(
      __dirname + '/fixtures/create-orgs/fails-to-create/already-exists',
    );
    exec(
      `node ${main} orgs:create --file=${pathToBadJson} --noDuplicateNames --no-includeExistingOrgsInOutput`,
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
        expect(stderr).toMatch(
          'All requested organizations failed to be created. Review the errors in',
        );
        expect(err).toBeNull();
        expect(stdout).toEqual('');
        const file = fs.readFileSync(
          path.resolve(logPath, `${GROUP_ID}.${FAILED_ORG_LOG_NAME}`),
          'utf8',
        );
        expect(file).toContain('Refusing to create a duplicate organization');
        deleteFiles([
          path.resolve(logPath, `${GROUP_ID}.${FAILED_ORG_LOG_NAME}`),
        ]);
      },
    ).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  }, 10000);
});
