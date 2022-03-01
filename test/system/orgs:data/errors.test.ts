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
});
