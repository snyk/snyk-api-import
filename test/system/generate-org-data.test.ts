import { exec } from 'child_process';
import { sep } from 'path';
import { deleteFiles } from '../delete-files';
const main = './dist/index.js'.replace(/\//g, sep);

describe('`snyk-api-import orgs:data <...>`', () => {
  const OLD_ENV = process.env;
  process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
  process.env.SNYK_LOG_PATH = __dirname;

  afterAll(async () => {
    process.env = { ...OLD_ENV };
  });
  it('Shows help text as expected', async (done) => {
    return exec(`node ${main} orgs:data help`, (err, stdout) => {
      if (err) {
        throw err;
      }
      expect(err).toBeNull();
      expect(stdout.trim()).toMatchSnapshot();
      done();
    });
  });

  it('Generates orgs data as expected', async (done) => {
    const groupId = 'hello';
    return exec(
      `node ${main} orgs:data --source=github --groupId=${groupId}`,
      (err, stdout) => {
        if (err) {
          throw err;
        }
        expect(err).toBeNull();
        expect(stdout.trim()).toMatchSnapshot();
        deleteFiles([`group-${groupId}-github-com-orgs.json`]);
        done();
      },
    );
  }, 20000);
  it('Shows error when missing groupId', async (done) => {
    return exec(
      `node ${main} orgs:data --source=github`,
      (err, stdout) => {
        expect(err).toMatchSnapshot();
        expect(stdout).toEqual('');
        done();
      },
    );
  });
});
