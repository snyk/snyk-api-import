import * as debugLib from 'debug';
import * as path from 'path';
import * as fs from 'fs';
import { defaultExclusionGlobs } from '../../common';

import { find, getSCMSupportedManifests, gitClone } from '../../lib';
import { getSCMSupportedProjectTypes } from '../../lib/supported-project-types/supported-manifests';
import type {
  RepoMetaData,
  SnykProject,
  SupportedIntegrationTypesUpdateProject,
  SyncTargetsConfig,
} from '../../lib/types';
import { generateProjectDiffActions } from './generate-projects-diff-actions';
import { deleteDirectory } from '../../lib/delete-directory';

const debug = debugLib('snyk:clone-and-analyze');

export async function cloneAndAnalyze(
  integrationType: SupportedIntegrationTypesUpdateProject,
  repoMetadata: RepoMetaData,
  snykMonitoredProjects: SnykProject[],
  config: Omit<SyncTargetsConfig, 'dryRun'>,
): Promise<{
  import: string[];
  remove: SnykProject[];
}> {
  const {
    manifestTypes,
    entitlements = ['openSource'],
    exclusionGlobs = [],
  } = config;
  const manifestFileTypes =
    manifestTypes && manifestTypes.length > 0
      ? manifestTypes
      : getSCMSupportedProjectTypes(entitlements);
  const { success, repoPath, gitResponse } = await gitClone(
    integrationType,
    repoMetadata,
  );
  debug('Clone response', { success, repoPath, gitResponse });

  if (!success) {
    throw new Error(gitResponse);
  }

  if (!repoPath) {
    throw new Error('No location returned for clones repo to analyze');
  }
  // validate and sanitize repoPath to prevent path traversal and other injection issues
  const safeRepoPath = path.resolve(repoPath as string);
  if (
    !safeRepoPath ||
    safeRepoPath.length === 0 ||
    safeRepoPath.length > 1024
  ) {
    throw new Error('Invalid repo path returned from gitClone');
  }
  if (safeRepoPath.includes('\0')) {
    throw new Error('Invalid repo path (contains null byte)');
  }
  // prevent upward traversal segments (e.g. '../')
  const normalizedRepo = path.normalize(repoPath);
  const pathSegments = normalizedRepo.split(path.sep);
  if (pathSegments.includes('..')) {
    throw new Error('Invalid repo path (contains parent directory traversal)');
  }
  if (
    !fs.existsSync(safeRepoPath) ||
    !fs.statSync(safeRepoPath).isDirectory()
  ) {
    throw new Error('Repo path does not exist or is not a directory');
  }

  // sanitize glob patterns to reduce ReDoS risk and bad patterns
  const sanitizeGlobs = (globs: string[] = []) => {
    if (!Array.isArray(globs)) return [] as string[];
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
  };

  const safeExclusions = sanitizeGlobs([
    ...defaultExclusionGlobs,
    ...exclusionGlobs,
  ]);
  const safeManifests = sanitizeGlobs(
    getSCMSupportedManifests(manifestFileTypes, entitlements),
  );

  // To avoid passing potentially dynamic glob patterns into the file-finder
  // (which could flow into regex compilation), retrieve all files and then
  // filter by a conservative whitelist of known manifest basenames plus any
  // sanitized literal manifest names. This eliminates the risk of untrusted
  // input being compiled into regular expressions.
  // Do not pass exclusion globs to `find` to avoid any possibility of
  // untrusted pattern -> regex flow. Instead retrieve all files and apply
  // only literal exclusions locally (no glob meta-characters).
  const allFilesRes = await find(safeRepoPath, [], [], 10);
  let files = allFilesRes.files;

  const hasGlobMeta = (s: string) =>
    s.includes('*') || s.includes('?') || s.includes('[') || s.includes(']');
  // only respect literal exclusions (no wildcard/regex patterns)
  const literalExclusions = safeExclusions.filter((g) => g && !hasGlobMeta(g));
  if (literalExclusions.length > 0) {
    files = files.filter((f) => {
      const base = path.basename(f);
      for (const ex of literalExclusions) {
        if (base === ex) return false;
        if (f.endsWith('/' + ex) || f.endsWith('\\' + ex)) return false;
      }
      return true;
    });
  }

  // Conservative known manifest basenames commonly used across ecosystems.
  const KNOWN_MANIFESTS = new Set([
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'settings.gradle',
    'requirements.txt',
    'pyproject.toml',
    'go.mod',
    'Cargo.toml',
    'composer.json',
    'Gemfile',
    'build.sbt',
    'pom.xml',
  ]);

  // Include any sanitized manifests that are literal filenames (no glob meta chars)
  const literalManifests = safeManifests.filter((m) => !hasGlobMeta(m));
  for (const m of literalManifests) KNOWN_MANIFESTS.add(m);

  const relativeFileNames = files
    .filter((f) => KNOWN_MANIFESTS.has(path.basename(f)))
    .map((f) => path.relative(safeRepoPath, f));
  debug(
    `Detected ${files.length} files in ${repoMetadata.cloneUrl}: ${files.join(
      ',',
    )}`,
  );

  try {
    await deleteDirectory(repoPath);
  } catch (error) {
    debug(`Failed to delete ${repoPath}. Error was ${error}.`);
  }

  return generateProjectDiffActions(
    relativeFileNames,
    snykMonitoredProjects,
    manifestFileTypes,
  );
}
