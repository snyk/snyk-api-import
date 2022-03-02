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
      expect(stdout.trim()).toMatchInlineSnapshot(`
"index.js

Kick off API powered import

Commands:
  index.js import         Kick off API powered import     [default] [aliases: i]
  index.js import:data    Generate data required for targets to be imported via
                          API to create Snyk projects.

  index.js list:imported  List all targets imported in Snyk for a given group &
                          source type. An analysis is performed on all current
                          organizations and their projects to generate this. The
                          generated file can be used to skip previously imported
                          targets when running the \`import\` command
  index.js orgs:create    Create the organizations in Snyk based on data file
                          generated with \`orgs:data\` command. Output generates
                          key data for created and existing organizations for
                          use to generate project import data.
  index.js orgs:data      Generate data required for Orgs to be created via API
                          by mirroring a given source.


Options:
  --version  Show version number                                       [boolean]
  --help     Show help                                                 [boolean]
  --file     Path to json file that contains the targets to be imported"
`);
    }).on('exit', (code) => {
      expect(code).toEqual(0);
      done();
    });
  }, 10000);
});
