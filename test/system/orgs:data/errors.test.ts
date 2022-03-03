import { exec } from 'child_process';
import * as path from 'path';
const main = './dist/index.js'.replace(/\//g, path.sep);

describe('General `snyk-api-import orgs:data <...>`', () => {
  const OLD_ENV = process.env;
  afterAll(async () => {
    process.env = { ...OLD_ENV };
  });
  it('Shows error when missing groupId', (done) => {
    exec(`node ${main} orgs:data --source=github`, (err, stdout, stderr) => {
      expect(err!.message).toMatch('Missing required argument: groupId');
      expect(stdout).toEqual('');
      expect(stderr).toMatch('Missing required argument: groupId');
    }).on('exit', (code) => {
      expect(code).toEqual(1);
      done();
    });
  });
  it('Shows error when token is invalid', (done) => {
    const groupId = 'hello';
    exec(
      `node ${main} orgs:data --source=github --groupId=${groupId}`,
      {
        env: {
          PATH: process.env.PATH,
          GITHUB_TOKEN: 'invalid',
          SNYK_LOG_PATH: __dirname,
        },
      },
      (err, stdout, stderr) => {
        expect(err!.message).toMatch('ERROR: Bad credentials');
        expect(stdout).toEqual('');
        expect(stderr).toMatch('ERROR: Bad credentials');
      },
    ).on('exit', (code) => {
      expect(code).toEqual(1);
      done();
    });
  });
});
