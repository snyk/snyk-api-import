import * as debugLib from 'debug';
import * as bunyan from 'bunyan';

import { getLoggingPath } from '../lib';
import { CREATED_ORG_LOG_NAME } from '../common';
import { CreatedOrgResponse } from '../lib';

const debug = debugLib('snyk:create-orgs-script');


export async function logCreatedOrg(
  groupId: string,
  origName: string,
  orgData: CreatedOrgResponse,
  integrationsData: {
    [name: string]: string;
  },
  loggingPath = getLoggingPath(),
): Promise<void> {
  const log = bunyan.createLogger({
    name: 'snyk:create-orgs-script',
    level: 'info',
    streams: [{
      level: 'info',
      path: `${loggingPath}/${groupId}.${CREATED_ORG_LOG_NAME}`,
    }],
  });

  try {
    const integrations = Object.keys(integrationsData).map(
      (i) => `${i}:${integrationsData[i]}`,
    );
    const { id, name, created } = orgData;
    log.info({ origName, id, name, created, integrations } , 'Created org');
  } catch (e) {
    debug('Failed to log created organizations at location: ', `${loggingPath}/${groupId}.${CREATED_ORG_LOG_NAME}`, e);
    // do nothing
  }
}
