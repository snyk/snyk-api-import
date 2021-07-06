import { exec } from 'child_process';
import { sep } from 'path';
const main = './dist/index.js'.replace(/\//g, sep);

describe('`snyk-api-import help <...>`', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_API = process.env.SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;

  afterAll(async () => {
    process.env = { ...OLD_ENV };
  });
  it('Shows help text as expected', (done) => {
    exec(`node ${main} help`, (err, stdout, stderr) => {
      if (err) {
        throw err;
      }
      expect(err).toBeNull();
      expect(stderr).toEqual('');
      expect(stdout.trim()).toMatchSnapshot();
      done();
    });
  });
});
