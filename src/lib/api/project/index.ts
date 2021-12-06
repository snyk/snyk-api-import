import 'source-map-support/register';
import * as needle from 'needle';
import * as debugLib from 'debug';
import { getApiToken } from '../../get-api-token';
import { getSnykHost } from '../../get-snyk-host';
const debug = debugLib('snyk:api-import');

export async function deleteProjects(
  orgId: string,
  projects: string[],
): Promise<boolean> {
  const apiToken = getApiToken();
  if (!(orgId && projects)) {
    throw new Error(
      `Missing required parameters. Please ensure you have provided: orgId & projectIds.`,
    );
  }
  debug('Deleting projectIds:', projects.join(', '));

  try {
    const SNYK_API = getSnykHost();
    const body = {
      projects,
    };
    const res = await needle(
      'post',
      `${SNYK_API}/org/${orgId.trim()}/projects/bulk-delete`,
      body,
      {
        json: true,
        // eslint-disable-next-line @typescript-eslint/camelcase
        read_timeout: 30000,
        headers: {
          'content-type': 'application/json',
          Authorization: `token ${apiToken}`,
        },
      },
    );
    const statusCode = res.statusCode;
    if (!statusCode || statusCode !== 200) {
      throw new Error(
        `Expected a 200 response, instead received statusCode: ${
          res.statusCode
        },
          body: ${JSON.stringify(res.body)}`,
      );
    }
    return res.body;
  } catch (error) {
    debug('Could not delete project:', error.message || error);
    const err: {
      message?: string | undefined;
      innerError?: string;
    } = new Error('Could not delete project');
    err.innerError = error;
    throw err;
  }
}
