// Checks if a Bitbucket Cloud workspace has no repositories
import needle = require('needle');

export async function organizationIsEmpty(token: string, workspace: string): Promise<boolean> {
  const url = `https://api.bitbucket.org/2.0/repositories/${workspace}`;
  const resp = await needle('get', url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (resp.statusCode !== 200) {
    throw new Error(`Failed to check workspace repos: ${resp.statusCode}`);
  }
  return !resp.body.values || resp.body.values.length === 0;
}
