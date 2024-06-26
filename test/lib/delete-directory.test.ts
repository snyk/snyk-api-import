import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deleteDirectory } from '../../src/lib/delete-directory';

describe('directory deletion', () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('directory is deleted with contents via Node `fs`', async () => {
    const dir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'fs-deletion-test-'),
    );
    await fs.promises.writeFile(path.join(dir, 'root.txt'), '');

    await deleteDirectory(dir);

    await expect(fs.promises.stat(dir)).rejects.toThrowError(
      'no such file or directory',
    );
  });

  test('directory is deleted with contents via `rimraf`', async () => {
    jest.spyOn(fs, 'rmSync').mockImplementation(() => {
      throw new Error('error');
    });

    const dir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'rimraf-deletion-test-'),
    );
    await fs.promises.writeFile(path.join(dir, 'root.txt'), '');

    await deleteDirectory(dir);

    await expect(fs.promises.stat(dir)).rejects.toThrowError(
      'no such file or directory',
    );
  });
});
