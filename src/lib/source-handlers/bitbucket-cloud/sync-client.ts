import axios from 'axios';
import type { AxiosInstance } from 'axios';

export type BitbucketAuthType = 'basic' | 'oauth' | 'api';

export interface BitbucketAuth {
  type: BitbucketAuthType;
  username?: string;
  appPassword?: string;
  token?: string; // For API or OAuth
}

export class BitbucketCloudSyncClient {
  private client: AxiosInstance;
  private username?: string;
  private appPassword?: string;

  constructor(auth: BitbucketAuth) {
    if (auth.type === 'basic' && auth.username && auth.appPassword) {
      this.username = auth.username;
      this.appPassword = auth.appPassword;
      this.client = axios.create({
        baseURL: 'https://api.bitbucket.org/2.0/',
        auth: {
          username: auth.username,
          password: auth.appPassword,
        },
      });
    } else if (auth.type === 'api' || auth.type === 'oauth') {
      // Ignore username/appPassword for these types
      this.client = axios.create({
        baseURL: 'https://api.bitbucket.org/2.0/',
        headers: {
          authorization: `Bearer ${auth.token}`,
        },
      });
    } else {
      throw new Error('Only Basic Auth, API token, or OAuth token are supported for Bitbucket Cloud sync.');
    }
  }

  async listRepositories(workspace: string) {
    try {
      const res = await this.client.get(`/repositories/${workspace}`);
      return res.data;
    } catch (err: any) {
      this.handleError(err);
    }
  }

  async getRepository(workspace: string, repoSlug: string) {
    try {
      const res = await this.client.get(`/repositories/${workspace}/${repoSlug}`);
      return res.data;
    } catch (err: any) {
      this.handleError(err);
    }
  }

  async listBranches(workspace: string, repoSlug: string) {
    try {
      const res = await this.client.get(`/repositories/${workspace}/${repoSlug}/refs/branches`);
      return res.data;
    } catch (err: any) {
      this.handleError(err);
    }
  }

  async listFiles(workspace: string, repoSlug: string, branch: string) {
    try {
      const url = `/repositories/${workspace}/${repoSlug}/src/${branch}/`;
      const res = await this.client.get(url);
      return res.data.values.map((file: any) => file.path);
    } catch (err: any) {
      this.handleError(err);
    }
  }

  private handleError(err: any) {
    if (err.response) {
      if (err.response.status === 429) {
        throw new Error('Bitbucket API rate limit exceeded (429 Too Many Requests)');
      }
      throw new Error(`Bitbucket API error: ${err.response.status} ${err.response.statusText}`);
    }
    throw err;
  }
}
