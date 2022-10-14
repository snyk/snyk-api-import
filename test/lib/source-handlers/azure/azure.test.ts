import * as nock from 'nock';
import * as fs from 'fs';
import * as path from 'path';
import { listAzureProjects } from '../../../../src/lib/source-handlers/azure/list-projects';
import { listAzureRepos } from '../../../../src/lib/source-handlers/azure/list-repos';

const fixturesFolderPath =
  path.resolve(__dirname, '../..') + '/fixtures/azure/';

process.env.AZURE_TOKEN = '123';
process.env.AZURE_ORG = 'testOrg';

beforeEach(() => {
  return nock('https://dev.azure.com')
    .persist()
    .get(/.*/)
    .reply(
      200,
      (uri: string) => {
        switch (uri) {
          case '/testOrg/_apis/projects?stateFilter=wellFormed&continuationToken=&api-version=4.1':
            return JSON.parse(
              fs.readFileSync(
                fixturesFolderPath + 'org-projects-first-page.json',
                'utf8',
              ),
            );
          case '/testOrg/_apis/projects?stateFilter=wellFormed&continuationToken=10&api-version=4.1':
            return JSON.parse(
              fs.readFileSync(
                fixturesFolderPath + 'org-projects-second-page.json',
                'utf8',
              ),
            );
          default:
        }
      },
      {
        'x-ms-continuationtoken': '10',
      },
    );
});

beforeEach(() => {
  return nock('https://azure-tests')
    .persist()
    .get(/.*/)
    .reply(200, (uri: string) => {
      switch (uri) {
        case '/reposTestOrg/_apis/projects?stateFilter=wellFormed&continuationToken=&api-version=4.1':
          return JSON.parse(
            fs.readFileSync(
              fixturesFolderPath + 'org-only-one-project.json',
              'utf8',
            ),
          );
        case '/reposTestOrg/371efd3e-3e86-4d33-846d-e5e46397dd91/_apis/git/repositories?api-version=4.1':
          return JSON.parse(
            fs.readFileSync(fixturesFolderPath + 'org-repos.json', 'utf8'),
          );
        default:
      }
    });
});

describe('Testing azure-devops interaction', () => {
  test('Test listAzureProjects with 2 pages', async () => {
    const projects = await listAzureProjects('testOrg', '');
    expect(projects).toHaveLength(10);
  });
  test('Test listAzureRepos with one page', async () => {
    const repos = await listAzureRepos('reposTestOrg', 'https://azure-tests');
    expect(repos).toHaveLength(3);
  });
  test('listAzureRepos to fail', async () => {
    expect(async () => {
      await listAzureRepos('non-existing-org', 'https://non-existing-url');
    }).rejects.toThrow();
  });
});
