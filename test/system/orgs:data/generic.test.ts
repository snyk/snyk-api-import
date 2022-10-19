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
          GITHUB_TOKEN: process.env.GH_TOKEN,
          SNYK_LOG_PATH: __dirname,
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          throw err;
        }
        expect(stderr).toEqual('');
        expect(err).toBeNull();
        expect(stdout).toEqual(
          `index.js orgs:data

Generate data required for Orgs to be created via API by mirroring a given
source.


Options:
  --version            Show version number                             [boolean]
  --help               Show help                                       [boolean]
  --sourceOrgPublicId  Public id of the organization in Snyk that can be used as
                       a template to copy all supported organization settings.
  --groupId            Public id of the group in Snyk (available on group
                       settings)                                      [required]
  --sourceUrl          Custom base url for the source API that can list
                       organizations (e.g. Github Enterprise url)
  --skipEmptyOrgs      Skip any organizations that do not any targets. (e.g.
                       Github Organization does not have any repos)
  --source             The source of the targets to be imported e.g. Github,
                       Github Enterprise, Gitlab, Bitbucket Server, Bitbucket
                       Cloud
                   [required] [choices: "github", "github-enterprise", "gitlab",
                      "bitbucket-server", "bitbucket-cloud"] [default: "github"]
`,
        );
      },
    ).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  });
});
