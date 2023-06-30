import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deleteDirectory } from '../../src/lib/delete-directory';

test('directory is deleted with contents', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'deletion-test-'));
  await fs.writeFile(path.join(dir, 'root.txt'), '');

  await deleteDirectory(dir);

  console.log(dir);

  await expect(fs.stat(dir)).rejects.toThrowError('no such file or directory');
});
