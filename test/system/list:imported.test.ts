import { exec } from 'child_process';
import * as path from 'path';
import { sep } from 'path';
import { IMPORT_LOG_NAME } from '../../src/common';
import { deleteFiles } from '../delete-files';
const main = './dist/index.js'.replace(/\//g, sep);

describe('`snyk-api-import list:imported <...>`', () => {
  const OLD_ENV = process.env;
  process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
  const GROUP_ID = process.env.TEST_GROUP_ID as string;
  const ORG_ID = process.env.TEST_ORG_ID as string;

  afterAll(async () => {
    process.env = { ...OLD_ENV };
  });
  it('Shows help text as expected', (done) => {
    exec(`node ${main} list:imported help`, (err, stdout) => {
      if (err) {
        throw err;
      }
      expect(err).toBeNull();
      expect(stdout.trim()).toMatchSnapshot();
    }).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  }, 20000);

  it('Generates Snyk imported targets data as expected for github + Group', (done) => {
    exec(
      `node ${main} list:imported --integrationType=github --groupId=${GROUP_ID}`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_LOG_PATH: __dirname,
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          throw err;
        }
        expect(stderr).toMatch('No projects in org');
        expect(err).toBeNull();
        expect(stdout.trim()).toMatch(
          `repo(s). Written the data to file: ${path.resolve(
            __dirname,
            'imported-targets.log',
          )}`,
        );
        deleteFiles([path.resolve(__dirname, IMPORT_LOG_NAME)]);
      },
    ).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  }, 20000);

  it('Generates Snyk imported targets data as expected for all integrations by default for an Org', (done) => {
    exec(
      `node ${main} list:imported --orgId=${ORG_ID}`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_LOG_PATH: __dirname,
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          throw err;
        }
        expect(stderr).toEqual('');
        expect(err).toBeNull();
        expect(stdout.trim()).toMatch(
          `target(s). Written the data to file: ${path.resolve(
            __dirname,
            'imported-targets.log',
          )}`,
        );
        deleteFiles([path.resolve(__dirname, IMPORT_LOG_NAME)]);
      },
    ).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  }, 10000);

  it('Generates Snyk imported targets data as expected for multiple integrations for an Org', (done) => {
    exec(
      `node ${main} list:imported --integrationType=github --integrationType=github-enterprise --orgId=${ORG_ID}`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_LOG_PATH: __dirname,
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          throw err;
        }
        expect(stderr).toEqual('');
        expect(err).toBeNull();
        expect(stdout.trim()).toMatch(
          `target(s). Written the data to file: ${path.resolve(
            __dirname,
            'imported-targets.log',
          )}`,
        );
        deleteFiles([path.resolve(__dirname, IMPORT_LOG_NAME)]);
      },
    ).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  }, 10000);

  it('Generates Snyk imported targets data as expected for an Org', (done) => {
    exec(
      `node ${main} list:imported --integrationType=github --orgId=${ORG_ID}`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_LOG_PATH: __dirname,
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          throw err;
        }
        expect(stderr).toEqual('');
        expect(err).toBeNull();
        expect(stdout.trim()).toMatch(
          `repo(s). Written the data to file: ${path.resolve(
            __dirname,
            'imported-targets.log',
          )}`,
        );
        deleteFiles([path.resolve(__dirname, IMPORT_LOG_NAME)]);
      },
    ).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  }, 10000);
  it('Shows error when missing groupId & orgId', (done) => {
    exec(
      `node ${main} list:imported --integrationType=github`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_LOG_PATH: __dirname,
        },
      },
      (err, stdout, stderr) => {
        expect(stderr).toMatch(
          'Missing required parameters: orgId or groupId must be provided.',
        );
        expect(err).toBe(null);
        expect(stdout).toEqual('');
      },
    ).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  }, 20000);
  it('Shows error when missing groupId & orgId', (done) => {
    exec(
      `node ${main} list:imported --integrationType=github --orgId=foo --groupId=bar`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_LOG_PATH: __dirname,
        },
      },
      (err, stdout, stderr) => {
        expect(stderr).toMatch(
          'Too many parameters: orgId or groupId must be provided, not both',
        );
        expect(err).toBe(null);
        expect(stdout).toEqual('');
      },
    ).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  }, 20000);
});
