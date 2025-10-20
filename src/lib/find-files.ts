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

// Exported helper to sanitize glob/filter inputs. Accepts an array of strings
// and returns a filtered array containing only safe patterns. This function is
// intentionally conservative to prevent malicious input from reaching the
// glob-to-regex pipeline (micromatch) and mitigate ReDoS risks.
export function sanitizeGlobs(globs: string[] = []): string[] {
  if (!Array.isArray(globs)) return [];
  const allowed =
    '[]ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-./*?';
  const out: string[] = [];
  for (const g of globs) {
    if (!g || typeof g !== 'string') continue;
    if (g.length > 256) continue;
    if (g.includes('\0')) continue;
    let ok = true;
    for (let i = 0; i < g.length; i++) {
      if (allowed.indexOf(g[i]) === -1) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(g);
  }
  return out;
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
  const safeIgnore = sanitizeGlobs(ignore);
  const safeFilter = sanitizeGlobs(filter);
  if (filter.length > 0) {
    const filename = pathLib.basename(path);
    if (matches(filename, safeFilter) || matches(path, safeFilter)) {
      return path;
    }
  } else {
    // deepcode ignore reDOS: path is supplied by trusted user of API (not externally supplied)
    if (matches(path, safeIgnore)) {
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
  // Ensure globs are sanitized at the boundary to prevent unsanitized input
  // from reaching micromatch (which can compile unsafe regexes).
  const safeGlobs = sanitizeGlobs(globs || []);
  globs = safeGlobs;
  // If the provided pattern looks like a glob (contains wildcard chars)
  // we delegate to micromatch. For simple filename matches (most callers
  // pass concrete filenames like `package.json`) use safe string
  // comparisons to avoid compiling user input into regular expressions
  // which can lead to ReDoS.
  const isGlob = (s: string) => {
    if (!s || typeof s !== 'string') return false;
    // basic heuristic: presence of glob meta-characters
    return (
      s.includes('*') || s.includes('?') || s.includes('[') || s.includes(']')
    );
  };

  const isSafeGlob = (s: string) => {
    if (!s || typeof s !== 'string') return false;
    // refuse overly long patterns
    if (s.length > 256) return false;
    // only allow a conservative set of characters in globs to avoid regex bombs
    // permitted: alphanumerics, dash, underscore, dot, slashes and glob meta
    const allowed =
      '[]ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-./*?';
    for (let i = 0; i < s.length; i++) {
      if (allowed.indexOf(s[i]) === -1) return false;
    }
    return true;
  };

  return globs.some((glob) => {
    if (!glob || typeof glob !== 'string') return false;
    // Limit length to a reasonable amount to avoid pathological input
    if (glob.length > 1024) return false;
    if (isGlob(glob)) {
      // Only use micromatch for glob patterns that pass our safety checks.
      if (!isSafeGlob(glob)) return false;
      return micromatch.isMatch(filePath, '**/' + glob);
    }
    // Treat as literal filename. Match by basename or by trailing path
    // segment to support both absolute and relative paths.
    try {
      const base = pathLib.basename(filePath);
      if (base === glob) return true;
      // also allow matching when the filePath ends with the given segment
      if (filePath.endsWith('/' + glob) || filePath.endsWith('\\' + glob))
        return true;
    } catch {
      // defensive: fall back to micromatch if something unexpected occurs
      return micromatch.isMatch(filePath, '**/' + glob);
    }
    return false;
  });
}
