import { Module } from '@nestjs/common';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';
import { ConfigModule } from '../config/config.module';
import { IpfsUploadService } from './ipfs-upload.service';

@Module({
  imports: [CircuitBreakerModule, ConfigModule],
  providers: [IpfsUploadService],
  exports: [IpfsUploadService],
})
export class IpfsUploadModule {}
