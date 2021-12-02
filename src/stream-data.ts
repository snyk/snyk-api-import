import * as debugLib from 'debug';

import * as fs from 'fs';
import split = require('split');

const debug = debugLib('streamData:load-file');
const debugSnyk = debugLib('snyk:load-file');

export async function streamData<DataType>(
  file: string,
  jsonKey: string,
): Promise<DataType[]> {
  let res;
  debug('Trying streamMinifiedJson');
  res = await streamMinifiedJson<DataType>(file, jsonKey);
  if (!res) {
    debug(
      `Failed to load as minified JSON, trying to load as beautified JSON with spaces`,
    );
    res = await streamBeautifiedJson<DataType>(file, jsonKey);
  }
  return res;
}

export async function streamMinifiedJson<DataType>(
  file: string,
  arrayKey: string,
): Promise<DataType[]> {
  return new Promise((resolve, reject) => {
    let data: DataType[];
    fs.createReadStream(file)
      .pipe(split())
      .on('data', (lineObj) => {
        if (!lineObj) {
          return;
        }
        try {
          const json = JSON.parse(lineObj);
          data = json[arrayKey];
        } catch (e) {
          debugSnyk(`ERROR: Could not find "${arrayKey}" key in json. Make sure the JSON is valid and the key is present`)
          debug(e.message);
        }
      })
      .on('error', (err) => {
        debug('Failed to createReadStream for file: ' + err);
        return reject(err);
      })
      .on('end', async () => resolve(data));
  });
}

export async function streamBeautifiedJson<DataType>(
  file: string,
  arrayKey: string,
): Promise<DataType[]> {
  return new Promise((resolve, reject) => {
    let data: DataType[];
    fs.createReadStream(file)
      .on('data', (jsonData) => {
        if (!jsonData) {
          return;
        }
        try {
          const json = JSON.parse(jsonData);
          data = json[arrayKey];
        } catch (e) {
          debug('ERROR parsing: ', e);
        }
      })
      .on('error', (err) => {
        debug('Failed to createReadStream for file: ' + err);
        return reject(err);
      })
      .on('end', async () => resolve(data));
  });
}
