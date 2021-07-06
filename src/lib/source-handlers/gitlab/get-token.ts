export function getToken(): string {
  const token = process.env.GITLAB_TOKEN;
  if (!token) {
    throw new Error(
      `Please set the GITLAB_TOKEN e.g. export GITLAB_TOKEN='mypersonalaccesstoken123'`,
    );
  }
  return token;
}
