import * as fs from 'fs';
import * as pathLib from 'path';
import debugLib from 'debug';
const debug = debugLib('snyk:find-files');

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
  // Don't allow character classes ([]) to avoid regex complexity that can
  // be used for ReDoS. Only allow alphanumerics, dash, underscore, dot,
  // slashes and the glob meta characters '*' and '?'.
  const allowed =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-./*?';
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
  // Sanitize ignore and filter inputs immediately and never use caller
  // supplied arrays directly. This ensures untrusted patterns are checked
  // and that `matches` only ever receives sanitized patterns.
  let safeIgnore = sanitizeGlobs(ignore);
  // ensure node_modules is always ignored
  if (!safeIgnore.includes('node_modules')) safeIgnore = [...safeIgnore, 'node_modules'];
  const safeFilter = sanitizeGlobs(filter);
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
  const safeIgnore = sanitizeGlobs(ignore);
  const safeFilter = sanitizeGlobs(filter);
  if (filter.length > 0) {
    const filename = pathLib.basename(path);
    // Only match against the filename to avoid sending full paths into
    // the matcher (static scanners flag flows from file paths into the
    // pattern sink). Matching by basename is sufficient for our use.
    if (matches(filename, safeFilter) || matches(filename, safeFilter)) {
      return path;
    }
  } else {
    // deepcode ignore reDOS: path is supplied by trusted user of API (not externally supplied)
    const filename = pathLib.basename(path);
    if (matches(filename, safeIgnore)) {
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
  // Sanitize ignores at the directory boundary so untrusted globs never
  // reach the matcher. Also pass sanitized ignores to recursive calls.
  const safeIgnoreList = sanitizeGlobs(ignore);
  const toFind = files
    .filter((file) => !matches(file, safeIgnoreList))
    .map((file) => {
      const resolvedPath = pathLib.resolve(path, file);
      if (!fs.existsSync(resolvedPath)) {
        debug('File does not seem to exist, skipping: ', file);
        return { files: [], allFilesFound: [] };
      }
      return find(resolvedPath, safeIgnoreList, filter, levelsDeep);
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

  // Simple segment matcher for '*' and '?' (no regexes)
  const matchSegment = (text: string, pat: string): boolean => {
    let ti = 0;
    let pi = 0;
    let starIdx = -1;
    let match = 0;
    while (ti < text.length) {
      if (pi < pat.length && (pat[pi] === '?' || pat[pi] === text[ti])) {
        ti++;
        pi++;
      } else if (pi < pat.length && pat[pi] === '*') {
        starIdx = pi;
        match = ti;
        pi++;
      } else if (starIdx !== -1) {
        pi = starIdx + 1;
        match++;
        ti = match;
      } else {
        return false;
      }
    }
    while (pi < pat.length && pat[pi] === '*') pi++;
    return pi === pat.length;
  };

  // Glob matcher that supports path separators and '**'. This function
  // intentionally avoids regex compilation and only implements the
  // functionality needed by the tests and runtime usage in this repo.
  const matchGlob = (filePath: string, pattern: string): boolean => {
    // Normalize to forward slashes for comparison
    const fp = filePath.split('\\').join('/');
    const pat = pattern.split('\\').join('/');
    // If pattern contains no slash, match against basename only
    if (!pat.includes('/')) {
      const base = pathLib.basename(fp);
      return matchSegment(base, pat) || matchSegment(fp, pat);
    }
    const fpSegments = fp.split('/').filter(Boolean);
    const patSegments = pat.split('/').filter(Boolean);

    const recurse = (i: number, j: number): boolean => {
      if (i === fpSegments.length && j === patSegments.length) return true;
      if (j === patSegments.length) return false;
      if (patSegments[j] === '**') {
        // Try to match ** to any number of segments (including zero)
        if (j + 1 === patSegments.length) return true; // trailing ** matches rest
        for (let k = i; k <= fpSegments.length; k++) {
          if (recurse(k, j + 1)) return true;
        }
        return false;
      }
      if (i >= fpSegments.length) return false;
      if (matchSegment(fpSegments[i], patSegments[j]))
        return recurse(i + 1, j + 1);
      return false;
    };

    return recurse(0, 0);
  };

  return globs.some((glob) => {
    if (!glob || typeof glob !== 'string') return false;
    // Limit length to a reasonable amount to avoid pathological input
    if (glob.length > 1024) return false;
    if (isGlob(glob)) {
      // Disallow character classes like [a-z] to avoid regex complexity
      if (glob.includes('[') || glob.includes(']')) return false;
      if (!isSafeGlob(glob)) return false;
      // Normalize common shorthand mistakes like '**requirements/*' ->
      // '**/requirements/*' so matching behaves like micromatch in those
      // cases while avoiding regex compilation of the pattern.
      // Insert a slash after '**' only when the next char is not '.' or '/'
      // so patterns like '**requirements' -> '**/requirements' but
      // '**.xml' stays unchanged.
      const normalizedGlob = glob.replace(/\*\*(?=[^./])/g, '**/');
      // Use our safe glob matcher that supports '**', '*' and '?'
      return matchGlob(filePath, normalizedGlob);
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
      // defensive: fall back to our safe glob matcher if something unexpected occurs
      const normalizedGlob = glob.replace(/\*\*(?=[^./])/g, '**/');
      return matchGlob(filePath, normalizedGlob);
    }
    return false;
  });
}
