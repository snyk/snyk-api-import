import * as fs from 'fs';

export function deleteLogs(logs: string[]): void {
  logs.forEach((path) => {
    try {
      fs.unlinkSync(path);
    } catch (e) {
      // do nothing
    }
  });
}
