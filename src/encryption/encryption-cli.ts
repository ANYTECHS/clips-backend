#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UserPlatformService } from '../user-platform/user-platform.service';
import { AppConfigService } from '../config/app-config.service';

async function runMigration() {
  console.log('🔐 Starting encryption migration for UserPlatform tokens...');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const userPlatformService = app.get(UserPlatformService);
  const appConfig = app.get(AppConfigService);

  const encryptionSecret = appConfig.encryptionSecret;
  if (!encryptionSecret) {
    console.error('❌ ENCRYPTION_SECRET environment variable is required');
    process.exit(1);
  }

  try {
    const result = await userPlatformService.migrateExistingRecords();
    console.log(`✅ Migration completed successfully!`);
    console.log(`📊 Processed ${result.migrated} UserPlatform records`);
    
    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await app.close();
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

runMigration();
