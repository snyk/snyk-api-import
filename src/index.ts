#!/usr/bin/env node

import * as yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
export * from './lib';

// Use the yargs initializer with hideBin to correctly parse argv in TypeScript
(yargs as any)(hideBin(process.argv))
  .commandDir('cmds')
  .help()
  .demandCommand()
  .parse();
