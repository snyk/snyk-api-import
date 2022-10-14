import { requestsManager } from 'snyk-request-manager';
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
    return res.data['ok'];
  } catch (err) {
    if (err instanceof Error) {
      //Currently this is the only way to distinguish between an actual 403 and a 403 that is returned when an org hasn't got that FF enabled
      if (JSON.stringify(err).search('"ok":false') > 0) {
        debug(
          `Feature flag ${featureFlagName} is not enabled for Org ${orgId}, please advise with your Snyk representative`,
        );
      } else {
        debug(
          `Could not fetch the ${featureFlagName} feature flag for ${orgId}\n ${JSON.stringify(
            err,
          )}`,
        );
      }
    }
    return false;
  }
}
