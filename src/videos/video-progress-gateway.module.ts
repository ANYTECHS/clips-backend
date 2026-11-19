import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { VideoProgressGateway } from './video-progress.gateway';

/**
 * Standalone module for the video-progress WebSocket gateway.
 *
 * Import this module wherever you need to inject VideoProgressGateway
 * (e.g. inside a BullMQ processor that calls emitProgress()).
 *
 * Closes #738
 */
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),
  ],
  providers: [VideoProgressGateway],
  exports: [VideoProgressGateway],
})
export class VideoProgressGatewayModule {}
