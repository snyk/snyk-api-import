export function getAzureToken(): string {
  const azureToken = process.env.AZURE_TOKEN;
  if (!azureToken) {
    throw new Error(
      `Please set the AZURE_TOKEN e.g. export AZURE_TOKEN='mypersonalaccesstoken123'`,
    );
  }
  return azureToken;
}
