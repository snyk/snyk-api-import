import type { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';

const debug = debugLib('snyk:get-feature-flag');

export async function getFeatureFlag(
  requestManager: requestsManager,
  featureFlagName: string,
  orgId: string,
): Promise<boolean> {
  debug(
    `Checking if feature flag ${featureFlagName} is enabled for Snyk org ${orgId}`,
  );
  try {
    const url = `cli-config/feature-flags/${featureFlagName}?org=${orgId}`;
    const res = await requestManager.request({
      verb: 'get',
      url: url,
      useRESTApi: false,
    });

    debug(`Feature flag ${featureFlagName} is enabled for Org ${orgId}`);

    const enabled: boolean = res.data['ok'];

    return enabled;
  } catch (err: any) {
    const res = err.message?.response?.data;
    const message = res?.userMessage || res?.message || err.message?.message;

    if (
      res &&
      res.ok === false &&
      res?.userMessage?.includes('feature enabled')
    ) {
      debug(`Feature flag ${featureFlagName} is not enabled for Org ${orgId}`);
      return false;
    }

    debug(
      `Could not fetch the ${featureFlagName} feature flag for ${orgId}. Error: ${JSON.stringify(
        err,
      )}`,
    );
    throw new Error(
      `Could not fetch the ${featureFlagName} feature flag for ${orgId}. ${message}`,
    );
  }
}
