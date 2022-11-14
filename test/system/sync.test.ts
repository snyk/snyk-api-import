import { exec } from 'child_process';
import * as path from 'path';
const main = './dist/index.js'.replace(/\//g, path.sep);

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('`snyk-api-import help <...>`', () => {
  const OLD_ENV = process.env;
  const ORG_ID = process.env.TEST_ORG_ID as string;

  afterAll(() => {
    process.env = { ...OLD_ENV };
  });
  it('Shows help text as expected', (done) => {
    exec(`node ${main} sync help`, (err, stdout) => {
      if (err) {
        throw err;
      }
      expect(err).toBeNull();
      expect(stdout.trim()).toMatchSnapshot();
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
        expect(stdout).toEqual('');
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
        expect(stdout).toEqual('');
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
        expect(stdout).toEqual('');
      },
    ).on('exit', (code) => {
      expect(code).toEqual(1);
      done();
    });
  }, 40000);
  it.todo('Success synced');
});
