import { requestsManager } from 'snyk-request-manager';
import {
  setNotificationPreferences,
  listProjects,
  listTargets,
} from '../../src/lib';

describe('org API unit tests (consolidated)', () => {
  const request = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setNotificationPreferences', () => {
    it('sends provided settings payload in PUT request and returns response data', async () => {
      const settings = {
        'test-limit': { enabled: false },
      } as const;

      const spy = jest
        .spyOn(request, 'request')
        .mockResolvedValue({ statusCode: 200, data: settings });

      const res = await setNotificationPreferences(
        request,
        'org-123',
        'exampleOrg',
        settings as any,
      );

      expect(spy).toHaveBeenCalledWith({
        verb: 'put',
        url: '/org/org-123/notification-settings',
        body: JSON.stringify(settings),
      });
      expect(res).toEqual(settings);
    });

    it('uses default disabled settings when settings param is omitted', async () => {
      const expectedDefault = {
        'new-issues-remediations': {
          enabled: false,
          issueType: 'none',
          issueSeverity: 'high',
        },
        'project-imported': { enabled: false },
        'test-limit': { enabled: false },
        'weekly-report': { enabled: false },
      } as const;

      const spy = jest
        .spyOn(request, 'request')
        .mockResolvedValue({ statusCode: 200, data: expectedDefault });

      const res = await setNotificationPreferences(
        request,
        'org-xyz',
        'exampleOrg',
      );

      expect(spy).toHaveBeenCalledWith({
        verb: 'put',
        url: '/org/org-xyz/notification-settings',
        body: JSON.stringify(expectedDefault),
      });
      expect(res).toEqual(expectedDefault);
    });

    it('throws when API responds with non-200 status', async () => {
      jest
        .spyOn(request, 'request')
        .mockResolvedValue({ statusCode: 500, data: { message: 'error' } });

      await expect(
        setNotificationPreferences(request, 'org-err', 'exampleOrg'),
      ).rejects.toThrow();
    });

    it('throws when requestManager.request rejects', async () => {
      jest
        .spyOn(request, 'request')
        .mockRejectedValue(new Error('network error'));

      await expect(
        setNotificationPreferences(request, 'org-net', 'exampleOrg'),
      ).rejects.toThrow('network error');
    });
  });

  describe('listProjects pagination', () => {
    it('follows next link and aggregates projects across pages', async () => {
      const orgId = 'org-paginated';

      const firstPageResponse = {
        statusCode: 200,
        data: {
          jsonapi: { version: '1.0' },
          data: [
            {
              id: 'proj-1',
              attributes: {
                targetReference: 'main',
                created: '2021-01-01T00:00:00Z',
                origin: 'github',
                name: 'repo/one',
                type: 'npm',
                status: 'active',
              },
            },
          ],
          links: { next: `/orgs/${orgId}/projects?page=2` },
        },
      };

      const secondPageResponse = {
        statusCode: 200,
        data: {
          jsonapi: { version: '1.0' },
          data: [
            {
              id: 'proj-2',
              attributes: {
                targetReference: 'develop',
                created: '2021-01-02T00:00:00Z',
                origin: 'github',
                name: 'repo/two',
                type: 'maven',
                status: 'active',
              },
            },
          ],
          links: {},
        },
      };

      const spy = jest.spyOn(request, 'request');
      spy
        .mockResolvedValueOnce(firstPageResponse)
        .mockResolvedValueOnce(secondPageResponse);

      const res = await listProjects(request, orgId);

      expect(res.projects).toHaveLength(2);
      expect(res.projects.map((p) => p.id)).toEqual(['proj-1', 'proj-2']);

      expect(spy.mock.calls[0][0]).toMatchObject({
        verb: 'get',
        url: `/orgs/${orgId}/projects?version=2022-09-15~beta`,
        useRESTApi: true,
      });
      expect(spy.mock.calls[1][0]).toMatchObject({
        verb: 'get',
        url: `/orgs/${orgId}/projects?page=2`,
        useRESTApi: true,
      });
    });
  });

  describe('listTargets pagination', () => {
    it('follows next link and aggregates targets across pages', async () => {
      const orgId = 'org-targets';

      const firstPage = {
        statusCode: 200,
        data: {
          jsonapi: { version: '1.0' },
          data: [
            {
              type: 'target',
              id: 't1',
              attributes: {
                isPrivate: true,
                origin: 'github',
                displayName: 'one',
                remoteUrl: null,
              },
            },
          ],
          links: { next: `/orgs/${orgId}/targets?page=2` },
        },
      };

      const secondPage = {
        statusCode: 200,
        data: {
          jsonapi: { version: '1.0' },
          data: [
            {
              type: 'target',
              id: 't2',
              attributes: {
                isPrivate: false,
                origin: 'bitbucket-cloud',
                displayName: 'two',
                remoteUrl: null,
              },
            },
          ],
          links: {},
        },
      };

      const spy = jest.spyOn(request, 'request');
      spy.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);

      const res = await listTargets(request, orgId);

      expect(res.targets).toHaveLength(2);
      expect(res.targets.map((t) => t.id)).toEqual(['t1', 't2']);

      expect(spy.mock.calls[0][0]).toMatchObject({
        verb: 'get',
        url: `/orgs/${orgId}/targets?version=2022-09-15~beta&limit=20&excludeEmpty=true`,
        useRESTApi: true,
      });
      expect(spy.mock.calls[1][0]).toMatchObject({
        verb: 'get',
        url: `/orgs/${orgId}/targets?page=2`,
        useRESTApi: true,
      });
    });
  });
});
