import * as fs from 'fs';
import * as pathLib from 'path';
import debugModule from 'debug';
import { isSafeGlobPattern, safeGlobIsMatch } from './safe-glob-pattern';

const debug = debugModule('snyk:find-files');

function sanitizeGlobs(globs: string[], kind: 'ignore' | 'filter'): string[] {
  const out: string[] = [];
  for (const g of globs) {
    if (isSafeGlobPattern(g)) {
      out.push(g);
    } else {
      debug(
        `Skipping unsafe ${kind} glob (${g.length} chars): ${g.slice(0, 64)}${
          g.length > 64 ? '...' : ''
        }`,
      );
    }
  }
  return out;
}

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
  const ignoreList = [...ignore];
  if (!ignoreList.includes('node_modules')) {
    ignoreList.push('node_modules');
  }
  const safeIgnore = sanitizeGlobs(ignoreList, 'ignore');
  const safeFilter = sanitizeGlobs(filter, 'filter');
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
        safeIgnore,
        safeFilter,
        levelsDeep,
      );
      found.push(...files);
      foundAll.push(...allFilesFound);
    } else if (fileStats.isFile()) {
      const fileFound = findFile(path, safeFilter, safeIgnore);
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
    if (
      entryMatchesGlobList(filename, filter) ||
      entryMatchesGlobList(path, filter)
    ) {
      return path;
    }
  } else {
    if (
      entryMatchesGlobList(pathLib.basename(path), ignore) ||
      entryMatchesGlobList(path, ignore)
    ) {
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
    .filter((file) => !entryMatchesGlobList(file, ignore))
    .map((file) => {
      const resolvedPath = pathLib.resolve(path, pathLib.basename(file));
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

/** Glob matching with bounded linear-time logic (see safe-glob-pattern). */
function entryMatchesGlobList(filePath: string, globs: string[]): boolean {
  return globs.some(
    (glob) => isSafeGlobPattern(glob) && safeGlobIsMatch(filePath, glob),
  );
}
