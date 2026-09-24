import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import type { AddressInfo } from 'net';
import axios from 'axios';
import { ApiAuthenticationError } from 'snyk-request-manager/dist/customErrors/apiError';
import { importTargets } from '../../../src/lib/api/import';
import { pollImportUrls } from '../../../src/lib/api/poll-import';
import {
  getErrorMessage,
  getErrorResponse,
} from '../../../src/lib/get-error-message';
import { FAILED_LOG_NAME, FAILED_POLLS_LOG_NAME } from '../../../src/common';

const SECRET = 'super-secret-snyk-token-1234';
const ORG_ID = 'org-redaction-test';
const API = 'https://api.redaction.test';

// Reproduce what snyk-request-manager throws: an ApiAuthenticationError whose
// `.message` is the raw AxiosError, carrying the Authorization header both in
// `config.headers` and in the serialized `request._header`. A real HTTP server
// (not nock) is used so that `request._header` is populated.
async function makeRequestManagerError(): Promise<any> {
  const server = http.createServer((_req, res) => {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'Invalid auth token' }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  try {
    await axios.post(
      `http://127.0.0.1:${port}/v1/org/${ORG_ID}/import`,
      {},
      { headers: { Authorization: `token ${SECRET}` } },
    );
  } catch (axiosError) {
    return new ApiAuthenticationError(axiosError);
  } finally {
    await new Promise((r) => server.close(r));
  }
  throw new Error('expected request to fail');
}

async function readLog(file: string): Promise<string> {
  // bunyan writes asynchronously
  for (let i = 0; i < 50; i++) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').length) {
      break;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  return fs.readFileSync(file, 'utf8');
}

describe('API token is never written to logs', () => {
  let logPath: string;
  const originalLogPath = process.env.SNYK_LOG_PATH;

  beforeEach(() => {
    logPath = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-redaction-'));
    process.env.SNYK_LOG_PATH = logPath;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.SNYK_LOG_PATH = originalLogPath;
    fs.rmSync(logPath, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('sanity: the wrapped error really contains the token', async () => {
    const error = await makeRequestManagerError();
    expect(typeof error.message).toBe('object');
    expect(error.message.request._header).toContain(SECRET);
  });

  it('getErrorMessage / getErrorResponse unwrap the Axios error safely', async () => {
    const error = await makeRequestManagerError();
    expect(getErrorMessage(error)).toBe('Request failed with status code 401');
    expect(getErrorResponse(error)?.status).toBe(401);
    expect(getErrorMessage(new Error('plain'))).toBe('plain');
    expect(getErrorMessage('str')).toBe('str');
    expect(getErrorMessage(undefined)).toBe('Unknown error');
    expect(getErrorMessage({ message: {} })).toBe('Unknown error');
  });

  it('failed imports log', async () => {
    const error = await makeRequestManagerError();
    const requestManager: any = { request: jest.fn().mockRejectedValue(error) };

    await importTargets(
      requestManager,
      [
        {
          orgId: ORG_ID,
          integrationId: 'integration-id',
          target: { name: 'repo', owner: 'owner', branch: 'main' },
        },
      ],
      logPath,
    );

    const log = await readLog(path.join(logPath, `${ORG_ID}.${FAILED_LOG_NAME}`));
    expect(log).not.toContain(SECRET);
    expect(log).toContain('Could not complete API import');
    expect(log).toContain('Invalid auth token');
    expect(log).toContain('status: 401');
  });

  it('failed polls log', async () => {
    const error = await makeRequestManagerError();
    const requestManager: any = { request: jest.fn().mockRejectedValue(error) };

    await pollImportUrls(requestManager, [
      `${API}/api/v1/org/${ORG_ID}/integrations/integration-id/import/job-id`,
    ]);

    const log = await readLog(
      path.join(logPath, `${ORG_ID}.${FAILED_POLLS_LOG_NAME}`),
    );
    expect(log).toContain('Request failed with status code 401');
    expect(log).not.toContain(SECRET);
  });
});
