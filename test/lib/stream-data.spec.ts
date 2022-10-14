import * as path from 'path';

import type { CreateOrgData } from '../../src/lib/types';
import { streamData } from '../../src/stream-data';

describe('streamData - Orgs', () => {
  const testRoot = __dirname + '/fixtures';

  it('correctly can stream minified json for 1 org', async () => {
    const importFile = path.resolve(
      testRoot,
      'create-orgs/1-org/1-org-minified.json',
    );
    const orgsData = await streamData<CreateOrgData>(importFile, 'orgs');
    expect(orgsData).toEqual([
      {
        groupId: 'd64abc45-b39a-48a2-9636-a4f62adbf09a',
        name: 'snyk-api-import-hello',
      },
    ]);
  });

  it('correctly can stream prettified json for 1 org', async () => {
    const importFile = path.resolve(
      testRoot,
      'create-orgs/1-org/1-org-prettified.json',
    );
    const orgsData = await streamData<CreateOrgData>(importFile, 'orgs');
    expect(orgsData).toEqual([
      {
        groupId: 'd64abc45-b39a-48a2-9636-a4f62adbf09a',
        name: 'snyk-api-import-hello',
      },
    ]);
  });
  it('correctly can stream minified json for 40k orgs', async () => {
    const importFile = path.resolve(
      testRoot,
      'create-orgs/many-orgs/minified.json',
    );
    const orgsData = await streamData<CreateOrgData>(importFile, 'orgs');
    expect(orgsData).toHaveLength(40_000);
  }, 50000);

  it('correctly can stream prettified json for 40k orgs', async () => {
    const importFile = path.resolve(
      testRoot,
      'create-orgs/many-orgs/prettified.json',
    );
    const orgsData = await streamData<CreateOrgData>(importFile, 'orgs');
    expect(orgsData).toHaveLength(40_000);
  }, 50000);
});
