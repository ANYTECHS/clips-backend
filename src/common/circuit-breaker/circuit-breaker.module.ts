import { Module, Global } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';
import { CircuitBreakerController } from './circuit-breaker.controller';

@Global()
@Module({
  providers: [CircuitBreakerService],
  controllers: [CircuitBreakerController],
  exports: [CircuitBreakerService],
})
export class CircuitBreakerModule {}
