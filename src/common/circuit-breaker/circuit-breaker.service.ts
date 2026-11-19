import { Injectable, Logger } from '@nestjs/common';
import {
  CircuitBreakerPolicy,
  SamplingBreaker,
  circuitBreaker,
  handleAll,
} from 'cockatiel';
import { ServiceUnavailableException } from '../exceptions/service-unavailable.exception';

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  recoveryTimeout: number;
  samplingDuration: number;
  successThreshold?: number;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerMetrics {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure?: Date;
  openedAt?: Date;
  halfOpenedAt?: Date;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<string, CircuitBreakerPolicy>();
  private readonly metrics = new Map<string, CircuitBreakerMetrics>();

  getBreaker(config: CircuitBreakerConfig): CircuitBreakerPolicy {
    if (this.breakers.has(config.name)) {
      return this.breakers.get(config.name)!;
    }

    const breaker = circuitBreaker(handleAll, {
      halfOpenAfter: config.recoveryTimeout,
      breaker: new SamplingBreaker({
        threshold: config.failureThreshold / 100,
        duration: config.samplingDuration,
      }),
    });

    const m: CircuitBreakerMetrics = { name: config.name, state: 'closed', failures: 0, successes: 0 };
    this.metrics.set(config.name, m);

    breaker.onBreak(() => {
      m.state = 'open';
      m.openedAt = new Date();
      this.logger.warn(`Circuit breaker '${config.name}' OPENED`);
    });
    breaker.onReset(() => {
      m.state = 'closed';
      m.failures = 0;
      this.logger.log(`Circuit breaker '${config.name}' CLOSED`);
    });
    breaker.onHalfOpen(() => {
      m.state = 'half-open';
      m.halfOpenedAt = new Date();
      this.logger.log(`Circuit breaker '${config.name}' HALF-OPEN`);
    });

    this.breakers.set(config.name, breaker);
    return breaker;
  }

  async execute<T>(config: CircuitBreakerConfig, fn: () => Promise<T>): Promise<T> {
    const breaker = this.getBreaker(config);
    const m = this.metrics.get(config.name)!;

    try {
      const result = await breaker.execute(fn);
      m.successes++;
      return result;
    } catch (error: any) {
      m.failures++;
      m.lastFailure = new Date();

      if (error?.name === 'BrokenCircuitError' || m.state === 'open') {
        this.logger.warn(`Circuit breaker '${config.name}' is OPEN - failing fast`);
        throw new ServiceUnavailableException(
          `Service '${config.name}' is temporarily unavailable. Please try again later.`,
          config.name,
        );
      }

      throw error;
    }
  }

  getAllMetrics(): CircuitBreakerMetrics[] {
    return Array.from(this.metrics.values());
  }

  getMetrics(name: string): CircuitBreakerMetrics | undefined {
    return this.metrics.get(name);
  }

  reset(name: string): void {
    this.breakers.delete(name);
    this.metrics.delete(name);
    this.logger.log(`Circuit breaker '${name}' has been reset`);
  }
}
