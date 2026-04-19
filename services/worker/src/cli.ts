#!/usr/bin/env node

import { Command } from 'commander';
import { IngestCommand } from './commands/ingest.command';
import { FitnessSyncerCommand } from './commands/fitnesssyncer.command';
import { GoogleDriveCommand } from './commands/google-drive.command';
import { SchedulerCommand } from './commands/scheduler.command';
import { InitService } from './services/init.service';

const program = new Command();

program
  .name('corpus-worker')
  .description('Corpus data ingestion worker')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize directories and default files')
  .action(async () => {
    const initService = new InitService();
    await initService.ensureDirectories();
  });

program
  .command('ingest')
  .description('Run ingestion process')
  .option('--sync', 'Sync files from drive_sync_root')
  .option('--rebuild', 'Rebuild canonical and derived datasets from raw')
  .action(async (options) => {
    const ingestCommand = new IngestCommand();
    if (options.rebuild) {
      await ingestCommand.rebuild();
    } else if (options.sync) {
      await ingestCommand.sync();
    } else {
      console.error('Please specify --sync or --rebuild');
      process.exit(1);
    }
  });

program
  .command('fitnesssyncer')
  .description('FitnessSyncer integration')
  .option('--sync', 'Sync data from FitnessSyncer')
  .option('--auth-url', 'Get authorization URL')
  .option('--exchange-code <code>', 'Exchange authorization code for token')
  .action(async (options) => {
    const fsCommand = new FitnessSyncerCommand();
    if (options.authUrl) {
      console.log(fsCommand.getAuthUrl());
    } else if (options.exchangeCode) {
      const tokens = await fsCommand.exchangeCode(options.exchangeCode);
      await fsCommand.saveToken(tokens.accessToken, tokens.refreshToken);
      console.log('Token saved successfully');
    } else if (options.sync) {
      const tokens = await fsCommand.loadToken();
      if (!tokens) {
        console.error('No FitnessSyncer token found. Please run --exchange-code first.');
        process.exit(1);
      }
      await fsCommand.sync(tokens.accessToken);
    } else {
      console.error('Please specify --auth-url, --exchange-code, or --sync');
      process.exit(1);
    }
  });

program
  .command('google-drive')
  .description('Google Drive medical reports sync')
  .option('--sync', 'Sync medical reports from Google Drive')
  .option('--auth-url', 'Get Google Drive OAuth authorization URL')
  .option('--exchange-code <code>', 'Exchange OAuth code for refresh token')
  .action(async (options) => {
    const driveCommand = new GoogleDriveCommand();
    if (options.authUrl) {
      console.log(driveCommand.getAuthUrl());
    } else if (options.exchangeCode) {
      const tokens = await driveCommand.exchangeCode(options.exchangeCode);
      await driveCommand.saveToken(tokens.accessToken, tokens.refreshToken);
      console.log('Google Drive token saved successfully');
    } else if (options.sync) {
      await driveCommand.sync();
    } else {
      console.error('Please specify --sync, --auth-url, or --exchange-code');
      process.exit(1);
    }
  });

program
  .command('scheduler')
  .description('Run scheduled syncs (for cron)')
  .action(async () => {
    const schedulerCommand = new SchedulerCommand();
    await schedulerCommand.run();
  });

program.parse(process.argv);

