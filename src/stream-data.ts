import debugLib from 'debug';

import * as fs from 'fs';
import split from 'split';

const debug = debugLib('streamData:load-file');
const debugSnyk = debugLib('snyk:load-file');

export async function streamData<DataType>(
  file: string,
  jsonKey: string,
): Promise<DataType[]> {
  let res;
  let parsedJson: DataType[];
  debug('Trying to stream as minified JSON');
  const fileStream = fs.createReadStream(file);

  res = await streamJson(fileStream.pipe(split()));
  if (!res) {
    debug(
      `Failed to load as minified JSON, trying to load as beautified JSON with spaces`,
    );
    res = await streamJson(fileStream);
  }
  try {
    const json = JSON.parse(res);
    parsedJson = json[jsonKey];
  } catch (e) {
    const err = `ERROR: Could not find "${jsonKey}" key in json. Make sure the JSON is valid and the key is present`;
    debugSnyk(err);
    debug(e.message);
    throw new Error(err);
  }
  return parsedJson;
}

export async function streamJson(fileStream: any): Promise<string> {
  let data = '';
  return new Promise((resolve, reject) => {
    fileStream
      .on('data', (lineObj: string) => {
        if (!lineObj) {
          return;
        }
        data += lineObj;
      })
      .on('error', (err: any) => {
        debug('Failed to createReadStream for file: ' + err);
        return reject(err);
      })
      .on('end', async () => resolve(data));
  });
}
