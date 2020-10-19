

// eslint-disable-next-line @typescript-eslint/class-name-casing
export class requestsManager {
  params: any;
  constructor(params: any = {}) {
    this.params = params;
  }

  request = (request: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (request.verb === 'get') {
        return reject({
          statusCode: 500,
        error: {
          message: 'Error calling Snyk api',
        }
        });
      }
      if (request.verb === 'post') {
        return resolve({
          statusCode: 201,
          headers: {
            location: 'https://app.snyk.io/api/v1/org/ORG-ID/integrations/INTEGRATION-ID/import/IMPORT-ID',
          }
        });
      }
    })
  }
}
