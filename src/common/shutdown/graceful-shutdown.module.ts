import { Global, Module } from '@nestjs/common';
import { GracefulShutdownService } from './graceful-shutdown.service';

/**
 * GracefulShutdownModule
 *
 * Global so that every processor module can inject GracefulShutdownService
 * without needing to import this module explicitly.
 */
@Global()
@Module({
  providers: [GracefulShutdownService],
  exports: [GracefulShutdownService],
})
export class GracefulShutdownModule {}
