import { exec } from 'child_process';
import { sep } from 'path';
import { deleteFiles } from '../delete-files';

const main = './dist/index.js'.replace(/\//g, sep);

describe('`snyk-api-import mirror <...>`', () => {
    const OLD_ENV = process.env;
    process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
    const GROUP_ID = process.env.TEST_GROUP_ID as string;
    const ORG_ID = process.env.TEST_ORG_ID as string;
  
    afterAll(async () => {
      process.env = { ...OLD_ENV };
    });
    it('Shows help text as expected', (done) => {
      exec(`node ${main} mirror help`, (err, stdout) => {
        if (err) {
          throw err;
        }
        expect(err).toBeNull();
        expect(stdout).toMatchSnapshot()
      }).on('exit', (code) => {
        expect(code).toEqual(0);
        done();
      });
    }, 20000);

  });