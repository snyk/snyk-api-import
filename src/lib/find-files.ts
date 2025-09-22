import * as fs from 'fs';
import * as micromatch from 'micromatch';
import * as pathLib from 'path';
import * as debugModule from 'debug';
const debug = debugModule('snyk:find-files');

/**
 * Returns files inside given file path.
 *
 * @param path file path.
 */
export async function readDirectory(path: string): Promise<string[]> {
  return await new Promise((resolve, reject) => {
    fs.readdir(path, (err, files) => {
      if (err) {
        reject(err);
      }
      resolve(files);
    });
  });
}

/**
 * Returns file stats object for given file path.
 *
 * @param path path to file or directory.
 */
export async function getStats(path: string): Promise<fs.Stats> {
  return await new Promise((resolve, reject) => {
    fs.stat(path, (err, stats) => {
      if (err) {
        reject(err);
      }
      resolve(stats);
    });
  });
}

interface FindFilesRes {
  files: string[];
  allFilesFound: string[];
}

/**
 * Find all files in given search path. Returns paths to files found.
 *
 * @param path file path to search.
 * @param ignore (optional) globs to ignore. Will always ignore node_modules.
 * @param filter (optional) file names to find. If not provided all files are returned.
 * @param levelsDeep (optional) how many levels deep to search, defaults to 5, this path and one sub directory.
 */
export async function find(
  path: string,
  ignore: string[] = [],
  filter: string[] = [],
  levelsDeep = 5,
): Promise<FindFilesRes> {
  const found: string[] = [];
  const foundAll: string[] = [];

  // ensure we ignore find against node_modules path.
  if (path.endsWith('node_modules')) {
    return { files: found, allFilesFound: foundAll };
  }
  // ensure node_modules is always ignored
  if (!ignore.includes('node_modules')) {
    ignore.push('node_modules');
  }
  try {
    if (levelsDeep < 0) {
      return { files: found, allFilesFound: foundAll };
    } else {
      levelsDeep--;
    }
    const fileStats = await getStats(path);
    if (fileStats.isDirectory()) {
      const { files, allFilesFound } = await findInDirectory(
        path,
        ignore,
        filter,
        levelsDeep,
      );
      found.push(...files);
      foundAll.push(...allFilesFound);
    } else if (fileStats.isFile()) {
      const fileFound = findFile(path, filter, ignore);
      if (fileFound) {
        found.push(fileFound);
        foundAll.push(fileFound);
      }
    }
    const filteredOutFiles = foundAll.filter((f) => !found.includes(f));
    if (filteredOutFiles.length) {
      debug(
        `Filtered out ${filteredOutFiles.length}/${
          foundAll.length
        } files: ${filteredOutFiles.join(', ')}`,
      );
    }
    return { files: found, allFilesFound: foundAll };
  } catch (err) {
    throw new Error(`Error finding files in path '${path}'.\n${err.message}`);
  }
}

function findFile(
  path: string,
  filter: string[] = [],
  ignore: string[] = [],
): string | null {
  if (filter.length > 0) {
    const filename = pathLib.basename(path);
    if (matches(filename, filter) || matches(path, filter)) {
      return path;
    }
  } else {
    // Sanitize input to prevent ReDoS
    const safePath = path.replace(/[^\w\-./]/g, '');
    if (matches(safePath, ignore)) {
      return null;
    }
    return path;
  }
  return null;
}

async function findInDirectory(
  path: string,
  ignore: string[] = [],
  filter: string[] = [],
  levelsDeep = 4,
): Promise<FindFilesRes> {
  const files = await readDirectory(path);
  const toFind = files
    .filter((file) => !matches(file, ignore))
    .map((file) => {
      const resolvedPath = pathLib.resolve(path, file);
      if (!fs.existsSync(resolvedPath)) {
        debug('File does not seem to exist, skipping: ', file);
        return { files: [], allFilesFound: [] };
      }
      return find(resolvedPath, ignore, filter, levelsDeep);
    });

  const found = await Promise.all(toFind);
  return {
    files: Array.prototype.concat.apply(
      [],
      found.map((f) => f.files),
    ),
    allFilesFound: Array.prototype.concat.apply(
      [],
      found.map((f) => f.allFilesFound),
    ),
  };
}

function matches(filePath: string, globs: string[]): boolean {
  return globs.some((glob) => micromatch.isMatch(filePath, '**/' + glob));
}
