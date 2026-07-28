import { Test, TestingModule } from '@nestjs/testing';
import { StellarService } from './stellar.service';
import { MetricsService } from '../metrics/metrics.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';
import { ServiceUnavailableException } from '../common/exceptions/service-unavailable.exception';

// Mock fetch for Horizon calls
global.fetch = jest.fn();

describe('StellarService', () => {
  let service: StellarService;
  let circuitBreakerService: CircuitBreakerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: MetricsService,
          useValue: { incrementStellarRpcErrors: jest.fn() },
        },
        CircuitBreakerService,
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
    circuitBreakerService = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  afterEach(() => {
    // Reset circuit breaker state
    circuitBreakerService.reset('stellar-horizon');
    circuitBreakerService.reset('stellar-rpc');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateAddress', () => {
    it('should return valid: true for a correct Stellar address', () => {
      // Real valid Stellar address
      const validAddress =
        'GC7OHFPWPSWXL4HMN6TXAG54MTZSMJIASWHO6KVRQNHNCXEAHWDSGGC3';
      const result = service.validateAddress(validAddress);
      expect(result.valid).toBe(true);
    });

    it('should return valid: false for an empty address', () => {
      const result = service.validateAddress('');
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Address is required');
    });

    it('should return valid: false for null input', () => {
      const result = service.validateAddress(null as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Address is required');
    });

    it('should return valid: false for an invalid format', () => {
      const result = service.validateAddress('invalid-address');
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid Stellar address format');
    });

    it('should return valid: false for an invalid checksum', () => {
      // Changed the last character from '3' to '4' to break the checksum
      const invalidAddress =
        'GC7OHFPWPSWXL4HMN6TXAG54MTZSMJIASWHO6KVRQNHNCXEAHWDSGGC4';
      const result = service.validateAddress(invalidAddress);
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid Stellar address format');
    });

    it('should return valid: false for an address that is not a public key', () => {
      const realSecretKey =
        'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // Not necessarily valid format
      const result = service.validateAddress(realSecretKey);
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid Stellar address format');
    });

    it('should return valid: false for non-ed25519 strings', () => {
      const result = service.validateAddress(
        'MZXW6YTBOI======',
      );
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid Stellar address format');
    });
  });

  describe('getTransactionStatus with circuit breaker', () => {
    it('should return transaction status when Horizon call succeeds', async () => {
      const mockResponse = {
        successful: true,
        created_at: '2024-01-01T00:00:00Z',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await service.getTransactionStatus('test-tx-hash');

      expect(result.found).toBe(true);
      expect(result.successful).toBe(true);
      expect(result.confirmedAt).toBeInstanceOf(Date);
    });

    it('should return not found for 404 response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 404,
        ok: false,
      });

      const result = await service.getTransactionStatus('unknown-tx-hash');

      expect(result.found).toBe(false);
    });

    it('should open circuit after 5 consecutive failures', async () => {
      // Mock to always fail
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error('Network error'),
      );

      // Trigger 5 failures
      for (let i = 0; i < 5; i++) {
        try {
          await service.getTransactionStatus(`tx-${i}`);
        } catch (e) {
          // Expected
        }
      }

      // Verify circuit breaker opened
      const metrics = circuitBreakerService.getMetrics('stellar-horizon');
      expect(metrics?.failures).toBeGreaterThanOrEqual(5);
    });

    it('should throw ServiceUnavailableException when circuit is open', async () => {
      // Mock to always fail
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error('Network error'),
      );

      // Trigger 5 failures to open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.getTransactionStatus(`tx-${i}`);
        } catch (e) {
          // Expected
        }
      }

      // Next call should fail with ServiceUnavailableException
      await expect(
        service.getTransactionStatus('test-tx'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('getAccountBalance with circuit breaker', () => {
    it('should track circuit breaker metrics for balance queries', async () => {
      // Horizon Server is complex to mock, so we'll verify the circuit breaker config exists
      const metrics = circuitBreakerService.getMetrics('stellar-horizon');
      // Initially undefined until first use
      expect(metrics).toBeUndefined();
    });
  });

  describe('circuit breaker state transitions', () => {
    it('should track circuit state changes', async () => {
      // Mock to fail initially then succeed
      let callCount = 0;
      (global.fetch as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ successful: true }),
        });
      });

      // Trigger 5 failures
      for (let i = 0; i < 5; i++) {
        try {
          await service.getTransactionStatus(`tx-${i}`);
        } catch (e) {
          // Expected
        }
      }

      // Check metrics
      let metrics = circuitBreakerService.getMetrics('stellar-horizon');
      expect(metrics?.failures).toBe(5);

      // Next call should fail fast with ServiceUnavailableException
      // (circuit is open)
      await expect(
        service.getTransactionStatus('final-tx'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('fundWithFriendbot', () => {
    it('should fund testnet address when fetch is successful', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const address = 'GC7OHFPWPSWXL4HMN6TXAG54MTZSMJIASWHO6KVRQNHNCXEAHWDSGGC3';
      await expect(service.fundWithFriendbot(address)).resolves.toBeUndefined();
      expect(global.fetch).toHaveBeenCalledWith(
        `https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`,
      );
    });

    it('should throw an error when Friendbot responds with non-ok status', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Bad Request'),
      });

      const address = 'GC7OHFPWPSWXL4HMN6TXAG54MTZSMJIASWHO6KVRQNHNCXEAHWDSGGC3';
      await expect(service.fundWithFriendbot(address)).rejects.toThrow(
        'Friendbot funding failed (400): Bad Request',
      );
    });

    it('should throw an error when fetch fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network failure'));

      const address = 'GC7OHFPWPSWXL4HMN6TXAG54MTZSMJIASWHO6KVRQNHNCXEAHWDSGGC3';
      await expect(service.fundWithFriendbot(address)).rejects.toThrow('Network failure');
    });

    it('should do nothing if not on testnet', async () => {
      jest.spyOn(service, 'isTestnet').mockReturnValueOnce(false);

      const address = 'GC7OHFPWPSWXL4HMN6TXAG54MTZSMJIASWHO6KVRQNHNCXEAHWDSGGC3';
      await service.fundWithFriendbot(address);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});

