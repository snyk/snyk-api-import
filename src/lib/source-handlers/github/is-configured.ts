import { getGithubToken } from './get-github-token';

export function isGithubConfigured(): boolean {
  getGithubToken();
  return true;
}
