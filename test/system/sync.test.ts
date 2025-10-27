const nock = require('nock');
import { exec } from 'child_process';
import * as path from 'path';
import { vol } from 'memfs';
jest.mock('fs', () => require('memfs').fs);

import { UPDATED_PROJECTS_LOG_NAME } from '../../src/common';
import { deleteFiles } from '../delete-files';
const main = './dist/index.js'.replace(/\//g, path.sep);

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('`snyk-api-import sync <...>`', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });
  afterAll(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    vol.reset();
  });
  beforeEach(() => {
    nock.cleanAll();
    vol.reset();
    jest.resetAllMocks();
    jest
      .spyOn(require('child_process'), 'exec')
      .mockImplementation((cmd: any, opts: any, cb: any) => {
        cb(null, 'mocked output', '');
        return {
          on: (event: string, fn: (code: number) => void) => {
            if (event === 'exit') fn(0);
          },
        };
      });
  });
  beforeEach(() => {
    vol.reset();
    jest.resetAllMocks();
    jest
      .spyOn(require('child_process'), 'exec')
      .mockImplementation((cmd: any, opts: any, cb: any) => {
        // Default mock: success, can be customized per test
        cb(null, 'mocked output', '');
        return {
          on: (event: string, fn: (code: number) => void) => {
            if (event === 'exit') fn(0);
          },
        };
      });
  });
  const ORG_ID = 'test-org-id';
  afterAll(() => {
    vol.reset();
  });
  beforeEach(() => {
    vol.reset();
    jest.resetAllMocks();
  });
  it('Shows help text as expected', (done) => {
    exec(`node ${main} sync help`, (err, stdout) => {
      if (err) {
        throw err;
      }
      expect(err).toBeNull();
      expect(stdout).toMatch(
        'Sync targets (e.g. repos) and their projects between Snyk and SCM for a given',
      );
    }).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  });

  it('fails when given a bad/non-existent org ID `123456789`', (done) => {
    const logPath = path.resolve(__dirname + '/fixtures');

    exec(
      `node ${main} sync --orgPublicId=123456789 --source=github`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_LOG_PATH: logPath,
        },
      },
      (err, stdout, stderr) => {
        expect(stderr).toMatchInlineSnapshot(`
          "ERROR! Failed to sync organization. Try running with \`DEBUG=snyk* <command> for more info\`.
          ERROR: Org 123456789 was not found or you may not have the correct permissions to access the org
          "
        `);
        expect(err!.message).toMatchInlineSnapshot(`
          "Command failed: node ./dist/index.js sync --orgPublicId=123456789 --source=github
          ERROR! Failed to sync organization. Try running with \`DEBUG=snyk* <command> for more info\`.
          ERROR: Org 123456789 was not found or you may not have the correct permissions to access the org
          "
        `);
        expect(stdout).toMatch('Running sync for github projects in org');
      },
    ).on('exit', (code) => {
      expect(code).toEqual(1);
      done();
    });
  }, 500000);

  it('fails when several sources are provided', (done) => {
    const logPath = path.resolve(__dirname + '/fixtures');

    exec(
      `node ${main} sync --orgPublicId=123456789 --source=github --source=github-enterprise`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_LOG_PATH: logPath,
        },
      },
      (err, stdout, stderr) => {
        expect(stderr).toMatch(
          'Please provide a single value for --source. Multiple sources processing is not supported.',
        );
        expect(err!.message).toMatch(
          `Please provide a single value for --source. Multiple sources processing is not supported.`,
        );
        expect(stdout).toMatch('');
      },
    ).on('exit', (code) => {
      expect(code).toEqual(1);
      done();
    });
  }, 500000);

  it('throws an error for an unsupported SCM like Bitbucket Server', (done) => {
    const logPath = path.resolve(__dirname);

    exec(
      `node ${main} sync --orgPublicId=123456789 --source=bitbucket-server --sourceUrl=somewhere.com`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_LOG_PATH: logPath,
        },
      },
      (err, stdout, stderr) => {
        expect(stderr).toMatch(`Argument: source, Given: "bitbucket-server"`);
        expect(err!.message).toMatch(
          `Argument: source, Given: "bitbucket-server"`,
        );
      },
    ).on('exit', (code) => {
      expect(code).toEqual(1);
      done();
    });
  }, 500000);

  it('Throws an error for if source auth details are not provided', (done) => {
    const logPath = path.resolve(__dirname);
    delete process.env.GITHUB_TOKEN;
    exec(
      `node ${main} sync --orgPublicId=${ORG_ID} --source=github`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_LOG_PATH: logPath,
        },
      },
      (err, stdout, stderr) => {
        expect(stderr).toMatchInlineSnapshot(`
          "ERROR! Failed to sync organization. Try running with \`DEBUG=snyk* <command> for more info\`.
          ERROR: Please set the GITHUB_TOKEN e.g. export GITHUB_TOKEN='mypersonalaccesstoken123'
          "
        `);
        expect(err!.message).toMatchInlineSnapshot(`
          "Command failed: node ./dist/index.js sync --orgPublicId=74e2f385-a54f-491e-9034-76c53e72927a --source=github
          ERROR! Failed to sync organization. Try running with \`DEBUG=snyk* <command> for more info\`.
          ERROR: Please set the GITHUB_TOKEN e.g. export GITHUB_TOKEN='mypersonalaccesstoken123'
          "
        `);
        expect(stdout).toMatch('Running sync for github projects in org');
      },
    ).on('exit', (code) => {
      expect(code).toEqual(1);
      done();
    });
  }, 500000);
  it('Successfully generates synced logs in --dryRun mode', (done) => {
    const logPath = path.resolve(__dirname);
    const updatedLog = path.resolve(
      `${logPath}/${ORG_ID}.${UPDATED_PROJECTS_LOG_NAME}`,
    );
    exec(
      `node ${main} sync --orgPublicId=${ORG_ID} --source=github-enterprise --sourceUrl=${process.env.TEST_GHE_URL} --dryRun=true`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_LOG_PATH: logPath,
          GITHUB_TOKEN: process.env.TEST_GHE_TOKEN,
        },
      },
      async (err, stdout) => {
        expect(err).toBeNull();
        expect(stdout).toMatch(
          'Done syncing targets for source github-enterprise',
        );
        expect(stdout).toMatch('Processed 4 targets (1 failed)');
        expect(stdout).toMatch('Updated 6 projects');

        // give file a little time to be finished to be written
        await new Promise((r) => setTimeout(r, 20000));
        const file = vol.readFileSync(updatedLog, 'utf8');
        // 1 project deactivated
        expect(file).toMatch('"Snyk project \\"deactivate\\" update completed');
        // another project has branch updated
        expect(file).toMatch('"from":"main","to":"master"');
        deleteFiles([updatedLog]);
      },
    ).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  }, 500000);
});
