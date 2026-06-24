import { Global, Module } from '@nestjs/common';
import { AppLoggerService } from './logger.service';
import { AppConfigModule } from '../config/config.module';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [AppLoggerService],
  exports: [AppLoggerService],
})
export class LoggerModule {}
