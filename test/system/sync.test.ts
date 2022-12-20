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
  const filesToDelete: string[] = [];
  afterAll(() => {
    process.env = { ...OLD_ENV };
  });
  afterEach(() => {
    deleteFiles(filesToDelete);
  });
  it('Shows help text as expected', (done) => {
    exec(`node ${main} sync help`, (err, stdout) => {
      if (err) {
        throw err;
      }
      expect(err).toBeNull();
      expect(stdout).toMatchInlineSnapshot(`
      "index.js sync

      Sync targets (e.g. repos) and their projects between Snyk and SCM for a given
      organization. Actions include:
      - updating monitored branch in Snyk to match the default branch from SCM

      Options:
        --version      Show version number                                   [boolean]
        --help         Show help                                             [boolean]
        --orgPublicId  Public id of the organization in Snyk that will be updated
                                                                            [required]
        --sourceUrl    Custom base url for the source API that can list organizations
                       (e.g. Github Enterprise url)
        --source       List of sources to be synced e.g. Github, Github Enterprise,
                       Gitlab, Bitbucket Server, Bitbucket Cloud
               [required] [choices: \\"github\\", \\"github-enterprise\\"] [default: \\"github\\"]
        --dryRun       Dry run option. Will create a log file listing the potential
                       updates                                        [default: false]
        --snykProduct  List of Snyk Products to consider when syncing an SCM repo for
                       deleting projects & importing new ones (default branch will be
                       updated for all projects in a target). Monitored Snyk Code
                       repos are automatically synced already, if Snyk Code is enabled
                       any new repo imports will bring in Snyk Code projects
                 [choices: \\"container\\", \\"open-source\\", \\"iac\\"] [default: \\"open-source\\"]
      "
      `);
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
  }, 40000);

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
  }, 40000);

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
  }, 40000);
  it('Successfully generates synced logs in --dryRun mode', (done) => {
    const logPath = path.resolve(__dirname);
    const updatedLog = path.resolve(
      `${logPath}/${ORG_ID}.${UPDATED_PROJECTS_LOG_NAME}`,
    );
    filesToDelete.push(updatedLog);
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
      (err, stdout, stderr) => {
        expect(stderr).toEqual('');
        expect(err).toBeNull();
        expect(stdout).toMatch(
          'Done syncing targets for source github-enterprise',
        );
        expect(stdout).toMatch('Processed 4 targets (0 failed)');
        expect(stdout).toMatch('Updated 2 projects');
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
  }, 100000);
});
