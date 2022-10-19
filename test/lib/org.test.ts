import { requestsManager } from 'snyk-request-manager';
import {
  listProjects,
  setNotificationPreferences,
  listTargets,
} from '../../src/lib';

const ORG_ID = process.env.TEST_ORG_ID as string;
const SNYK_API_TEST = process.env.SNYK_API_TEST as string;

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

// TODO: Those tests needs to be mocked and move the existing once to the system test folder
describe('Org notification settings', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  afterAll(async () => {
    process.env = { ...OLD_ENV };
  }, 1000);
  it('Can change the notification settings for org', async () => {
    const res = await setNotificationPreferences(
      requestManager,
      ORG_ID,
      'exampleName',
      {
        'test-limit': {
          enabled: false,
        },
      },
    );
    expect(res).toMatchObject({
      'test-limit': {
        enabled: false,
      },
    });
  }, 5000);
  it('Default disables all notifications', async () => {
    const res = await setNotificationPreferences(
      requestManager,
      ORG_ID,
      'exampleName',
    );
    expect(res).toEqual({
      'new-issues-remediations': {
        enabled: false,
        issueSeverity: 'high',
        issueType: 'none',
      },
      'project-imported': {
        enabled: false,
      },
      'test-limit': {
        enabled: false,
      },
      'weekly-report': {
        enabled: false,
      },
    });
  }, 5000);
});

describe('listProjects', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  afterAll(async () => {
    process.env = { ...OLD_ENV };
  }, 1000);
  it('Lists projects in a given Org', async () => {
    const res = await listProjects(requestManager, ORG_ID);
    expect(res).toMatchObject({
      org: {
        id: ORG_ID,
      },
      projects: expect.any(Array),
    });
    expect(res.projects[0]).toMatchObject({
      name: expect.any(String),
      branch: expect.any(String),
    });
  }, 5000);
});

describe('listTargets', () => {
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });


  it('list the targets in a given Org without pagination - mock', async () => {
    jest.spyOn(requestManager, 'request').mockResolvedValue({
      statusCode: 200,
      data: {
        jsonapi: { version: '1.0' },
        data: [
          {
            type: 'target',
            id: '8d7f3e14-3e31-4f56-9b9f-5100d97bexxx',
            attributes: {
              isPrivate: true,
              origin: 'github-enterprise',
              displayName: 'api-import-circle-test/js-nested-manifest',
              remoteUrl: null,
            },
            relationships: {
              org: {
                data: {
                  id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                  type: 'org',
                },
                links: {
                  self: {
                    href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                  },
                },
              },
            },
          },
          {
            type: 'target',
            id: '6bc6d051-34a4-4883-becc-c0d658efexxx',
            attributes: {
              isPrivate: true,
              origin: 'github-enterprise',
              displayName: 'api-import-circle-test/ruby-with-versions',
              remoteUrl: null,
            },
            relationships: {
              org: {
                data: {
                  id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                  type: 'org',
                },
                links: {
                  self: {
                    href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                  },
                },
              },
            },
          },
          {
            type: 'target',
            id: '5f3f0648-a18c-49eb-b415-56a591afcxxx',
            attributes: {
              isPrivate: true,
              origin: 'bitbucket-server',
              displayName: 'antoine-snyk-demo/TestRepoAntoine',
              remoteUrl: null,
            },
            relationships: {
              org: {
                data: {
                  id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                  type: 'org',
                },
                links: {
                  self: {
                    href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                  },
                },
              },
            },
          },
          {
            type: 'target',
            id: '7fab7f61-0ed9-4696-a878-8c14122b8xxx',
            attributes: {
              isPrivate: true,
              origin: 'bitbucket-cloud',
              displayName: 'snyk-test-scm/dotnet-mixed-manifests',
              remoteUrl: null,
            },
            relationships: {
              org: {
                data: {
                  id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                  type: 'org',
                },
                links: {
                  self: {
                    href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                  },
                },
              },
            },
          },
          {
            type: 'target',
            id: '3300bafb-cb25-45de-9833-321b3620xxxx',
            attributes: {
              isPrivate: false,
              origin: 'bitbucket-cloud',
              displayName: 'snyk-test-scm/npm-lockfiles',
              remoteUrl: null,
            },
            relationships: {
              org: {
                data: {
                  id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                  type: 'org',
                },
                links: {
                  self: {
                    href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                  },
                },
              },
            },
          },
          {
            type: 'target',
            id: '1fd5033d-0e55-422f-b76e-9b25d7b9xxxx',
            attributes: {
              isPrivate: true,
              origin: 'bitbucket-cloud',
              displayName: 'snyk-test-scm/test-spaces',
              remoteUrl: null,
            },
            relationships: {
              org: {
                data: {
                  id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                  type: 'org',
                },
                links: {
                  self: {
                    href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                  },
                },
              },
            },
          },
          {
            type: 'target',
            id: '72ec5dcf-9982-4bfa-86aa-06e2516axxxx',
            attributes: {
              isPrivate: false,
              origin: 'azure-repos',
              displayName: 'Test 105/goof.git',
              remoteUrl: null,
            },
            relationships: {
              org: {
                data: {
                  id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                  type: 'org',
                },
                links: {
                  self: {
                    href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                  },
                },
              },
            },
          },
          {
            type: 'target',
            id: 'da026d55-5ea5-47f8-a81c-86d9bf7fxxxx',
            attributes: {
              isPrivate: false,
              origin: 'github',
              displayName: 'snyk-fixtures/composer-with-vulns',
              remoteUrl: null,
            },
            relationships: {
              org: {
                data: {
                  id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                  type: 'org',
                },
                links: {
                  self: {
                    href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                  },
                },
              },
            },
          },
          {
            type: 'target',
            id: '7fe02681-8deb-4f3b-a2d3-0c9990f7xxxx',
            attributes: {
              isPrivate: false,
              origin: 'github',
              displayName: 'snyk-fixtures/js-nested-manifest',
              remoteUrl: 'null',
            },
            relationships: {
              org: {
                data: {
                  id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                  type: 'org',
                },
                links: {
                  self: {
                    href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                  },
                },
              },
            },
          },
        ],
        links: {},
      },
    });

    const res = await listTargets(requestManager, ORG_ID);
    expect(res).toMatchSnapshot();
  }, 5000);

  it('list the targets in a given Org with filter - mock', async () => {
    const req = jest.spyOn(requestManager, 'request');

    req.mockResolvedValue({
      statusCode: 200,
      data: {
        jsonapi: { version: '1.0' },
        data: [
          {
            type: 'target',
            id: '8d7f3e14-3e31-4f56-9b9f-5100d97bexxx',
            attributes: {
              isPrivate: true,
              origin: 'github-enterprise',
              displayName: 'api-import-circle-test/js-nested-manifest',
              remoteUrl: null,
            },
            relationships: {
              org: {
                data: {
                  id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                  type: 'org',
                },
                links: {
                  self: {
                    href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                  },
                },
              },
            },
          },
          {
            type: 'target',
            id: '6bc6d051-34a4-4883-becc-c0d658efexxx',
            attributes: {
              isPrivate: true,
              origin: 'github-enterprise',
              displayName: 'api-import-circle-test/ruby-with-versions',
              remoteUrl: null,
            },
            relationships: {
              org: {
                data: {
                  id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                  type: 'org',
                },
                links: {
                  self: {
                    href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                  },
                },
              },
            },
          },
        ],
        links: {},
      },
    });

    const res = await listTargets(requestManager, ORG_ID, {
      origin: 'github-enterprise',
    });
    expect(req).toBeCalledWith({
      body: undefined,
      url:
        '/orgs/74e2f385-a54f-491e-9034-76c53e72927a/targets?version=2022-09-15~beta&origin=github-enterprise',
      useRESTApi: true,
      verb: 'get',
    });
    expect(res).toMatchSnapshot();
  }, 5000);

  it('list the targets in a given Org with pagination - mock', async () => {
    const req = jest.spyOn(requestManager, 'request');

    req
      .mockResolvedValueOnce({
        statusCode: 200,
        data: {
          jsonapi: { version: '1.0' },
          data: [
            {
              type: 'target',
              id: '8d7f3e14-3e31-4f56-9b9f-5100d97bexxx',
              attributes: {
                isPrivate: true,
                origin: 'github-enterprise',
                displayName: 'api-import-circle-test/js-nested-manifest',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: '6bc6d051-34a4-4883-becc-c0d658efexxx',
              attributes: {
                isPrivate: true,
                origin: 'github-enterprise',
                displayName: 'api-import-circle-test/ruby-with-versions',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: '5f3f0648-a18c-49eb-b415-56a591afcxxx',
              attributes: {
                isPrivate: true,
                origin: 'bitbucket-server',
                displayName: 'antoine-snyk-demo/TestRepoAntoine',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: '7fab7f61-0ed9-4696-a878-8c14122b8xxx',
              attributes: {
                isPrivate: true,
                origin: 'bitbucket-cloud',
                displayName: 'snyk-test-scm/dotnet-mixed-manifests',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: '3300bafb-cb25-45de-9833-321b3620xxxx',
              attributes: {
                isPrivate: false,
                origin: 'bitbucket-cloud',
                displayName: 'snyk-test-scm/npm-lockfiles',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: '1fd5033d-0e55-422f-b76e-9b25d7b9xxxx',
              attributes: {
                isPrivate: true,
                origin: 'bitbucket-cloud',
                displayName: 'snyk-test-scm/test-spaces',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: '72ec5dcf-9982-4bfa-86aa-06e2516axxxx',
              attributes: {
                isPrivate: false,
                origin: 'azure-repos',
                displayName: 'Test 105/goof.git',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: 'da026d55-5ea5-47f8-a81c-86d9bf7fxxxx',
              attributes: {
                isPrivate: false,
                origin: 'github',
                displayName: 'snyk-fixtures/composer-with-vulns',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: '7fe02681-8deb-4f3b-a2d3-0c9990f7xxxx',
              attributes: {
                isPrivate: false,
                origin: 'github',
                displayName: 'snyk-fixtures/js-nested-manifest',
                remoteUrl: 'null',
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
          ],
          links: {
            first:
              '/orgs/74e2f385-a54f-491e-9034-76c53e72927a/targets?version=2022-09-15~beta',
            last:
              '/orgs/74e2f385-a54f-491e-9034-76c53e72927a/targets?version=2022-09-15~beta&starting_after=v1.eyg',
            next:
              '/orgs/74e2f385-a54f-491e-9034-76c53e72927a/targets?version=2022-09-15~beta&starting_after=v1.eyJ',
            self:
              '/orgs/74e2f385-a54f-491e-9034-76c53e72927a/targets?version=2022-09-15~beta',
          },
        },
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        data: {
          jsonapi: { version: '1.0' },
          data: [
            {
              type: 'target',
              id: '8d7f3e14-3e31-4f56-9b9f-5100d97bexxx',
              attributes: {
                isPrivate: true,
                origin: 'github-enterprise',
                displayName: 'api-import-circle-test/js-nested-manifest',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: '6bc6d051-34a4-4883-becc-c0d658efexxx',
              attributes: {
                isPrivate: true,
                origin: 'github-enterprise',
                displayName: 'api-import-circle-test/ruby-with-versions',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: '5f3f0648-a18c-49eb-b415-56a591afcxxx',
              attributes: {
                isPrivate: true,
                origin: 'bitbucket-server',
                displayName: 'antoine-snyk-demo/TestRepoAntoine',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: '7fab7f61-0ed9-4696-a878-8c14122b8xxx',
              attributes: {
                isPrivate: true,
                origin: 'bitbucket-cloud',
                displayName: 'snyk-test-scm/dotnet-mixed-manifests',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: '3300bafb-cb25-45de-9833-321b3620xxxx',
              attributes: {
                isPrivate: false,
                origin: 'bitbucket-cloud',
                displayName: 'snyk-test-scm/npm-lockfiles',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: '1fd5033d-0e55-422f-b76e-9b25d7b9xxxx',
              attributes: {
                isPrivate: true,
                origin: 'bitbucket-cloud',
                displayName: 'snyk-test-scm/test-spaces',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: '72ec5dcf-9982-4bfa-86aa-06e2516axxxx',
              attributes: {
                isPrivate: false,
                origin: 'azure-repos',
                displayName: 'Test 105/goof.git',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: 'da026d55-5ea5-47f8-a81c-86d9bf7fxxxx',
              attributes: {
                isPrivate: false,
                origin: 'github',
                displayName: 'snyk-fixtures/composer-with-vulns',
                remoteUrl: null,
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
            {
              type: 'target',
              id: '7fe02681-8deb-4f3b-a2d3-0c9990f7xxxx',
              attributes: {
                isPrivate: false,
                origin: 'github',
                displayName: 'snyk-fixtures/js-nested-manifest',
                remoteUrl: 'null',
              },
              relationships: {
                org: {
                  data: {
                    id: 'e661d4ef-5ad5-4cef-ad16-5157cefa8xxx',
                    type: 'org',
                  },
                  links: {
                    self: {
                      href: '/v3/orgs/e661d4ef-5ad5-4cef-ad16-5157cefaxxx',
                    },
                  },
                },
              },
            },
          ],
          links: {
            first:
              '/orgs/74e2f385-a54f-491e-9034-76c53e72927a/targets?version=2022-09-15~beta',
            last:
              '/orgs/74e2f385-a54f-491e-9034-76c53e72927a/targets?version=2022-09-15~betapage=2',
            self:
              '/orgs/74e2f385-a54f-491e-9034-76c53e72927a/targets?version=2022-09-15~betapage=2',
          },
        },
      });

    const res = await listTargets(requestManager, ORG_ID);
    expect(res).toMatchSnapshot();
  }, 5000);

  it('Error if the requests fails', async () => {
    jest
      .spyOn(requestManager, 'request')
      .mockResolvedValue({ statusCode: 500, data: {} });

    expect(async () => {
      await listTargets(requestManager, ORG_ID);
    }).rejects.toThrowError(
      'Expected a 200 response, instead received: {"data":{},"status":500}',
    );
  }, 5000);
});
