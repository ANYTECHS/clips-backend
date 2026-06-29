import { Controller, Get, Delete, Param, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CircuitBreakerService, CircuitBreakerMetrics } from './circuit-breaker.service';

@ApiTags('circuit-breaker')
@Controller('circuit-breaker')
export class CircuitBreakerController {
  constructor(private readonly circuitBreakerService: CircuitBreakerService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get all circuit breaker metrics' })
  @ApiResponse({
    status: 200,
    description: 'Returns metrics for all circuit breakers',
    type: Object,
    isArray: true,
  })
  getAllMetrics(): CircuitBreakerMetrics[] {
    return this.circuitBreakerService.getAllMetrics();
  }

  @Get('metrics/:name')
  @ApiOperation({ summary: 'Get metrics for a specific circuit breaker' })
  @ApiResponse({
    status: 200,
    description: 'Returns metrics for the specified circuit breaker',
    type: Object,
  })
  getMetrics(@Param('name') name: string): CircuitBreakerMetrics | undefined {
    return this.circuitBreakerService.getMetrics(name);
  }

  @Delete('reset/:name')
  @HttpCode(204)
  @ApiOperation({ summary: 'Reset a circuit breaker to closed state' })
  @ApiResponse({
    status: 204,
    description: 'Circuit breaker reset successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Circuit breaker not found',
  })
  resetBreaker(@Param('name') name: string): void {
    this.circuitBreakerService.reset(name);
  }
}
