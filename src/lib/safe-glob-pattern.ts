/** Maximum length for a single glob pattern (mitigates ReDoS). */
export const SAFE_GLOB_MAX_LENGTH = 128;

/** Maximum path length matched against a glob (bounds work for linear matcher). */
export const MAX_MATCH_PATH_LENGTH = 8192;

/**
 * Returns true if the string is safe to use as a glob segment list (no braces/brackets).
 * Rejects constructs that commonly trigger ReDoS in regex-backed glob engines.
 */
export function isSafeGlobPattern(glob: string): boolean {
  if (typeof glob !== 'string' || glob.length === 0) {
    return false;
  }
  if (glob.length > SAFE_GLOB_MAX_LENGTH) {
    return false;
  }
  // Typical manifest globs: *.csproj, requirements/*.txt, *req*.txt
  if (!/^[\w\-*?./]+$/.test(glob)) {
    return false;
  }
  if (/\*{3,}/.test(glob)) {
    return false;
  }
  return true;
}

/**
 * Linear-time `*` / `?` match for a single path segment (no slashes in pattern).
 */
function segmentGlobMatch(text: string, pattern: string): boolean {
  const m = text.length;
  const n = pattern.length;
  const dp: boolean[][] = Array.from({ length: m + 1 }, () =>
    Array<boolean>(n + 1).fill(false),
  );
  dp[0][0] = true;
  for (let j = 1; j <= n; j++) {
    dp[0][j] = dp[0][j - 1] && pattern[j - 1] === '*';
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (pattern[j - 1] === '*') {
        dp[i][j] = dp[i - 1][j] || dp[i][j - 1];
      } else if (
        pattern[j - 1] === '?' ||
        pattern[j - 1] === text[i - 1]
      ) {
        dp[i][j] = dp[i - 1][j - 1];
      }
    }
  }
  return dp[m][n];
}

function matchGlobSegments(
  pathSegs: string[],
  globSegs: string[],
  pi: number,
  gi: number,
): boolean {
  if (gi === globSegs.length) {
    return pi === pathSegs.length;
  }
  if (globSegs[gi] === '**') {
    if (gi === globSegs.length - 1) {
      return true;
    }
    for (let i = pi; i <= pathSegs.length; i++) {
      if (matchGlobSegments(pathSegs, globSegs, i, gi + 1)) {
        return true;
      }
    }
    return false;
  }
  if (pi >= pathSegs.length) {
    return false;
  }
  if (!segmentGlobMatch(pathSegs[pi], globSegs[gi])) {
    return false;
  }
  return matchGlobSegments(pathSegs, globSegs, pi + 1, gi + 1);
}

function matchGlobPathNormalized(pathNorm: string, fullGlob: string): boolean {
  const pathSegs = pathNorm.split('/').filter((s) => s.length > 0);
  const globSegs = fullGlob.split('/').filter((s) => s.length > 0);
  return matchGlobSegments(pathSegs, globSegs, 0, 0);
}

/**
 * Safe substitute for micromatch.isMatch(candidatePath, userGlob) for manifest-style globs.
 * Uses O(path × pattern) dynamic programming — no runtime regex compilation.
 */
export function safeGlobIsMatch(candidatePath: string, userGlob: string): boolean {
  if (typeof candidatePath !== 'string') {
    return false;
  }
  if (candidatePath.length > MAX_MATCH_PATH_LENGTH) {
    return false;
  }
  if (!isSafeGlobPattern(userGlob)) {
    return candidatePath.endsWith(userGlob);
  }
  const norm = candidatePath.split('\\').join('/');
  const fullGlob = `**/${userGlob}`;
  return (
    matchGlobPathNormalized(norm, fullGlob) || norm.endsWith(userGlob)
  );
}
