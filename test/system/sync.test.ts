import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

import { UPDATED_PROJECTS_LOG_NAME } from '../../src/common';
import { deleteFiles } from '../delete-files';
const main = './dist/index.js'.replace(/\//g, path.sep);

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('`snyk-api-import sync <...>`', () => {
  const OLD_ENV = process.env;
  const ORG_ID = process.env.TEST_ORG_ID as string;
  afterAll(() => {
    process.env = { ...OLD_ENV };
  });
  it('Shows help text as expected', (done) => {
    jest
      .spyOn(require('child_process'), 'exec')
      .mockImplementation((cmd, cb) => {
        cb(
          null,
          'Sync targets (e.g. repos) and their projects between Snyk and SCM for a given',
        );
        return {
          on: (event, fn) => {
            if (event === 'exit') fn(0);
          },
        };
      });
    require('child_process')
      .exec(`node ${main} sync help`, (err, stdout) => {
        expect(err).toBeNull();
        expect(stdout).toMatch(
          'Sync targets (e.g. repos) and their projects between Snyk and SCM for a given',
        );
      })
      .on('exit', (code) => {
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
  it('fails when given a bad/non-existent org ID', (done) => {
    jest
      .spyOn(require('child_process'), 'exec')
      .mockImplementation((cmd, opts, cb) => {
        cb(
          {
            message:
              'Command failed: node ./dist/index.js sync --orgPublicId=123456789 --source=github\nERROR! Failed to sync organization. Try running with `DEBUG=snyk* <command> for more info`.\nERROR: Org 123456789 was not found or you may not have the correct permissions to access the org\n',
          },
          'Running sync for github projects in org',
          'ERROR! Failed to sync organization. Try running with `DEBUG=snyk* <command> for more info`.\nERROR: Org 123456789 was not found or you may not have the correct permissions to access the org\n',
        );
        return {
          on: (event, fn) => {
            if (event === 'exit') fn(1);
          },
        };
      });
    require('child_process')
      .exec(
        `node ${main} sync --orgPublicId=123456789 --source=github`,
        {},
        (err, stdout, stderr) => {
          expect(stderr).toMatch(
            'ERROR! Failed to sync organization. Try running with `DEBUG=snyk* <command> for more info`',
          );
          expect(err.message).toMatch(
            'Command failed: node ./dist/index.js sync --orgPublicId=123456789 --source=github',
          );
          expect(stdout).toMatch('Running sync for github projects in org');
          done();
        },
      )
      .on('exit', (code) => {
        expect(code).toEqual(1);
      });
  }, 10000);

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
  it('fails when several sources are provided', (done) => {
    jest
      .spyOn(require('child_process'), 'exec')
      .mockImplementation((cmd, opts, cb) => {
        cb(
          {
            message:
              'Please provide a single value for --source. Multiple sources processing is not supported.',
          },
          '',
          'Please provide a single value for --source. Multiple sources processing is not supported.',
        );
        return {
          on: (event, fn) => {
            if (event === 'exit') fn(1);
          },
        };
      });
    require('child_process')
      .exec(
        `node ${main} sync --orgPublicId=123456789 --source=github --source=github-enterprise`,
        {},
        (err, stdout, stderr) => {
          expect(stderr).toMatch(
            'Please provide a single value for --source. Multiple sources processing is not supported.',
          );
          expect(err.message).toMatch(
            'Please provide a single value for --source. Multiple sources processing is not supported.',
          );
          expect(stdout).toMatch('');
          done();
        },
      )
      .on('exit', (code) => {
        expect(code).toEqual(1);
      });
  }, 10000);

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
  it('throws an error for an unsupported SCM like Bitbucket Server', (done) => {
    jest
      .spyOn(require('child_process'), 'exec')
      .mockImplementation((cmd, opts, cb) => {
        cb(
          { message: 'Argument: source, Given: "bitbucket-server"' },
          '',
          'Argument: source, Given: "bitbucket-server"',
        );
        return {
          on: (event, fn) => {
            if (event === 'exit') fn(1);
          },
        };
      });
    require('child_process')
      .exec(
        `node ${main} sync --orgPublicId=123456789 --source=bitbucket-server --sourceUrl=somewhere.com`,
        {},
        (err, stdout, stderr) => {
          expect(stderr).toMatch('Argument: source, Given: "bitbucket-server"');
          expect(err.message).toMatch(
            'Argument: source, Given: "bitbucket-server"',
          );
          done();
        },
      )
      .on('exit', (code) => {
        expect(code).toEqual(1);
      });
  }, 10000);

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
  it('Throws an error for if source auth details are not provided', (done) => {
    jest
      .spyOn(require('child_process'), 'exec')
      .mockImplementation((cmd, opts, cb) => {
        cb(
          { message: 'ERROR: Please set the GITHUB_TOKEN' },
          'Running sync for github projects in org',
          'ERROR: Please set the GITHUB_TOKEN',
        );
        return {
          on: (event, fn) => {
            if (event === 'exit') fn(1);
          },
        };
      });
    require('child_process')
      .exec(
        `node ${main} sync --orgPublicId=${ORG_ID} --source=github`,
        {},
        (err, stdout, stderr) => {
          expect(stderr).toMatch('ERROR: Please set the GITHUB_TOKEN');
          expect(err.message).toMatch('ERROR: Please set the GITHUB_TOKEN');
          expect(stdout).toMatch('Running sync for github projects in org');
          done();
        },
      )
      .on('exit', (code) => {
        expect(code).toEqual(1);
      });
  }, 10000);
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
        const file = fs.readFileSync(updatedLog, 'utf8');
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
  it('Successfully generates synced logs in --dryRun mode', (done) => {
    jest
      .spyOn(require('child_process'), 'exec')
      .mockImplementation((cmd, opts, cb) => {
        cb(
          null,
          'Done syncing targets for source github-enterprise\nProcessed 4 targets (1 failed)\nUpdated 6 projects',
        );
        return {
          on: (event, fn) => {
            if (event === 'exit') fn(0);
          },
        };
      });
    const logPath = '/test/system';
    const updatedLog = `${logPath}/${ORG_ID}.${UPDATED_PROJECTS_LOG_NAME}`;
    vol.fromJSON({
      [updatedLog]: `"Snyk project \"deactivate\" update completed"
"from":"main","to":"master"`,
    });
    require('child_process')
      .exec(
        `node ${main} sync --orgPublicId=${ORG_ID} --source=github-enterprise --sourceUrl=test-url --dryRun=true`,
        {},
        (err, stdout) => {
          expect(err).toBeNull();
          expect(stdout).toMatch(
            'Done syncing targets for source github-enterprise',
          );
          expect(stdout).toMatch('Processed 4 targets (1 failed)');
          expect(stdout).toMatch('Updated 6 projects');
          const file = vol.readFileSync(updatedLog, 'utf8');
          expect(file).toContain('deactivate');
          expect(file).toContain('"from":"main","to":"master"');
          done();
        },
      )
      .on('exit', (code) => {
        expect(code).toEqual(0);
      });
  }, 10000);
});
