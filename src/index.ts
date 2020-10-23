#!/usr/bin/env node

import * as yargs from 'yargs';
export * from './lib';

yargs
  .commandDir('cmds')
  .help()
  .demandCommand()
  .argv
