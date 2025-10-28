#!/usr/bin/env node

// Ensure packer/bundler-visible optional modules are loaded early.
import './runtime/pkg-includes';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
export * from './lib';

// Statically import CLI command modules and register them with yargs.
// This avoids yargs.commandDir which relies on caller-file discovery that can
// break when bundling (import.meta / ESM shims). Static imports are bundler-
// friendly and deterministic.
import * as importCmd from './cmds/import';
import * as importDataCmd from './cmds/import:data';
import * as listImportedCmd from './cmds/list:imported';
import * as orgsCreateCmd from './cmds/orgs:create';
import * as orgsDataCmd from './cmds/orgs:data';
import * as syncCmd from './cmds/sync';

// Use the yargs initializer with hideBin to correctly parse argv in TypeScript
(yargs as any)(hideBin(process.argv))
  .command(importCmd as any)
  .command(importDataCmd as any)
  .command(listImportedCmd as any)
  .command(orgsCreateCmd as any)
  .command(orgsDataCmd as any)
  .command(syncCmd as any)
  .help()
  .demandCommand()
  .parse();
