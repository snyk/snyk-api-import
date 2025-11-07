import type { requestsManager } from 'snyk-request-manager';
import debugLib from 'debug';

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
    // Support multiple axios error shapes: err.response?.data or err.message?.response?.data
    const res =
      err?.response?.data ||
      err?.message?.response?.data ||
      err?.message?.response ||
      undefined;
    const message =
      res?.userMessage || res?.message || err?.message || err?.toString();

    // Some Snyk API responses indicate the feature is not enabled (403) with
    // a userMessage like "Org X doesn't have 'custom-branch' feature enabled".
    // Treat that as the flag being disabled.
    if (
      res &&
      res.ok === false &&
      typeof res.userMessage === 'string' &&
      res.userMessage.includes('feature enabled')
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
