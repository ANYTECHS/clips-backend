import { Test, TestingModule } from '@nestjs/testing';
import { CircuitBreakerService, CircuitBreakerConfig } from './circuit-breaker.service';
import { ServiceUnavailableException } from '../exceptions/service-unavailable.exception';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  const testConfig: CircuitBreakerConfig = {
    name: 'test-breaker',
    failureThreshold: 3,
    recoveryTimeout: 1000,
    samplingDuration: 5000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CircuitBreakerService],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  afterEach(() => {
    service.reset(testConfig.name);
  });

  describe('execute', () => {
    it('should return successful result when function succeeds', async () => {
      const result = await service.execute(testConfig, async () => {
        return 'success';
      });
      expect(result).toBe('success');
    });

    it('should throw ServiceUnavailableException when function fails on a low failure-rate breaker', async () => {
      const testError = new Error('Test error');

      await expect(
        service.execute(testConfig, async () => {
          throw testError;
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should open circuit after threshold failures', async () => {
      const testError = new Error('Test error');

      // Trigger failures up to threshold
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        try {
          await service.execute(testConfig, async () => {
            throw testError;
          });
        } catch (e) {
          // Expected
        }
      }

      // Next call should fail with ServiceUnavailableException
      await expect(
        service.execute(testConfig, async () => {
          return 'success';
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should not execute function when circuit is open', async () => {
      const testError = new Error('Test error');
      let executionCount = 0;

      // Trigger failures up to threshold
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        try {
          await service.execute(testConfig, async () => {
            executionCount++;
            throw testError;
          });
        } catch (e) {
          // Expected
        }
      }

      executionCount = 0;

      // Next call should fail immediately without executing
      try {
        await service.execute(testConfig, async () => {
          executionCount++;
          return 'success';
        });
      } catch (e) {
        // Expected
      }

      expect(executionCount).toBe(0);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics for existing breaker', async () => {
      // Execute to create the breaker
      await service.execute(testConfig, async () => 'test');

      const metrics = service.getMetrics(testConfig.name);
      expect(metrics).toBeDefined();
      expect(metrics?.name).toBe(testConfig.name);
      expect(metrics?.state).toBe('closed');
    });

    it('should return undefined for non-existing breaker', () => {
      const metrics = service.getMetrics('non-existing');
      expect(metrics).toBeUndefined();
    });
  });

  describe('getAllMetrics', () => {
    it('should return all circuit breaker metrics', async () => {
      // Create multiple breakers
      const config1: CircuitBreakerConfig = {
        name: 'breaker-1',
        failureThreshold: 3,
        recoveryTimeout: 1000,
        samplingDuration: 5000,
      };

      const config2: CircuitBreakerConfig = {
        name: 'breaker-2',
        failureThreshold: 5,
        recoveryTimeout: 2000,
        samplingDuration: 10000,
      };

      await service.execute(config1, async () => 'test1');
      await service.execute(config2, async () => 'test2');

      const allMetrics = service.getAllMetrics();
      expect(allMetrics.length).toBeGreaterThanOrEqual(2);
      expect(allMetrics.some(m => m.name === 'breaker-1')).toBe(true);
      expect(allMetrics.some(m => m.name === 'breaker-2')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset breaker to closed state', async () => {
      const testError = new Error('Test error');

      // Open the circuit
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        try {
          await service.execute(testConfig, async () => {
            throw testError;
          });
        } catch (e) {
          // Expected
        }
      }

      // Verify it's open
      await expect(
        service.execute(testConfig, async () => 'success'),
      ).rejects.toThrow(ServiceUnavailableException);

      // Reset
      service.reset(testConfig.name);

      // Should work now
      const result = await service.execute(testConfig, async () => 'success');
      expect(result).toBe('success');
    });

    it('should not throw when resetting non-existing breaker', () => {
      expect(() => {
        service.reset('non-existing');
      }).not.toThrow();
    });
  });

  describe('state transitions', () => {
    it('should transition from closed to open after failures', async () => {
      const testError = new Error('Test error');

      await service.execute(testConfig, async () => 'init');

      // Initial state should be closed
      let metrics = service.getMetrics(testConfig.name);
      expect(metrics?.state).toBe('closed');

      // Trigger failures
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        try {
          await service.execute(testConfig, async () => {
            throw testError;
          });
        } catch (e) {
          // Expected
        }
        metrics = service.getMetrics(testConfig.name);
        expect(metrics?.failures).toBe(i + 1);
      }

      // Circuit should be open now
      metrics = service.getMetrics(testConfig.name);
      expect(metrics?.state).toBe('open');
      expect(metrics?.openedAt).toBeDefined();
    });

    it('should track successes', async () => {
      // Execute successfully
      await service.execute(testConfig, async () => 'test1');
      await service.execute(testConfig, async () => 'test2');

      const metrics = service.getMetrics(testConfig.name);
      expect(metrics?.successes).toBe(2);
    });

    it('should track last failure time', async () => {
      const testError = new Error('Test error');

      try {
        await service.execute(testConfig, async () => {
          throw testError;
        });
      } catch (e) {
        // Expected
      }

      const metrics = service.getMetrics(testConfig.name);
      expect(metrics?.lastFailure).toBeDefined();
      expect(metrics?.lastFailure).toBeInstanceOf(Date);
    });
  });
});
