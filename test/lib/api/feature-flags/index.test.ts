import { requestsManager } from 'snyk-request-manager';
import { getFeatureFlag } from '../../../../src/lib/api/feature-flags';

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');
const orgId = process.env.TEST_ORG_ID as string;

describe('getFeatureFlag', () => {
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
    maxRetryCount: 1,
  });
  afterAll(async () => {
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

  it('Error if the request fails with generic 403 - not a real Snyk org', async () => {
    const res = await getFeatureFlag(
      requestManager,
      'nonEnabledFeatureFlag',
      '0000',
    );
    expect(res).toBeFalsy();
  }, 20000);

  it('Error if the request fails with a 403 that indicates the FF is not enabled for a real org', async () => {
    const res = await getFeatureFlag(
      requestManager,
      'nonEnabledFeatureFlag',
      orgId,
    );
    expect(res).toBeFalsy();
  }, 20000);
});
