import { exec } from 'child_process';
import * as path from 'path';
const main = './dist/index.js'.replace(/\//g, path.sep);

describe('General `snyk-api-import orgs:data <...>`', () => {
  const OLD_ENV = process.env;
  afterAll(() => {
    process.env = { ...OLD_ENV };
  });
  it('Shows help text as expected', (done) => {
    exec(
      `node ${main} orgs:data help`,
      {
        env: {
          PATH: process.env.PATH,
          GITHUB_TOKEN: process.env.GITHUB_TOKEN,
          SNYK_LOG_PATH: __dirname,
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          throw err;
        }
        expect(stderr).toEqual('');
        expect(err).toBeNull();
        const out = stdout;
        expect(out).toMatch(/index\.js orgs:data/);
        expect(out).toMatch(/Options:/);
        expect(out).toMatch(/--groupId/);
        expect(out).toMatch(/--source/);
        // Ensure common choices are present
        expect(out).toEqual(expect.stringContaining('github'));
        expect(out).toEqual(
          expect.stringContaining('bitbucket-cloud') ||
            expect.stringContaining('bitbucket-cloud-app'),
        );
      },
    ).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  });
});
