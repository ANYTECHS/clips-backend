import { Module } from '@nestjs/common';
import { ClipsModule } from '../clips/clips.module';

@Module({
  imports: [ClipsModule],
})
export class NftModule {}
