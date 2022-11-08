import { requestsManager } from 'snyk-request-manager';
import { getFeatureFlag } from '../../../../src/lib/api/feature-flags';

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('getFeatureFlag', () => {
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
    maxRetryCount: 1,
  });
  const OLD_ENV = process.env;
  const orgId = process.env.TEST_ORG_ID as string;

  beforeAll(() => {
    process.env.SNYK_API = process.env.SNYK_API_TEST;
    process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;
  });
  afterAll(() => {
    jest.restoreAllMocks();
    process.env = { ...OLD_ENV };
  }, 1000);
  afterEach(() => {
    jest.resetAllMocks();
  }, 1000);

  it('get feature flag for org - mock', async () => {
    jest.spyOn(requestManager, 'request').mockResolvedValueOnce({
      data: {
        ok: true,
      },
    });

    const res = await getFeatureFlag(
      requestManager,
      'existingFeatureFlag',
      'someOrgId',
    );
    expect(res).toBeTruthy();
  });

  it('Error if the request fails with 404 - user has no access to an org', async () => {
    const message =
      'Org test-org was not found or you may not have the correct permissions to access the org';
    const error = new Error('Request failed with status code 404');
    (error as any).message = {
      response: {
        data: {
          ok: false,
          message,
        },
      },
    };
    jest.spyOn(requestManager, 'request').mockRejectedValue(error);
    await expect(
      getFeatureFlag(requestManager, 'nonEnabledFeatureFlag', '0000'),
    ).rejects.toThrowError(
      'Could not fetch the nonEnabledFeatureFlag feature flag for 0000. Org test-org was not found or you may not have the correct permissions to access the org',
    );
  }, 20000);

  it('Error if the request fails with a 403 that indicates the FF is not enabled for a real org', async () => {
    const error = new Error('Request failed with status code 403');
    (error as any).message = {
      response: {
        data: {
          ok: false,
          userMessage:
            "Org test-comet doesn't have 'non-enabled-feature-flag' feature enabled",
        },
      },
    };
    jest.spyOn(requestManager, 'request').mockRejectedValue(error);
    const res = await getFeatureFlag(
      requestManager,
      'nonEnabledFeatureFlag',
      orgId,
    );
    expect(res).toBe(false);
  }, 20000);
});
