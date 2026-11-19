import { BadGatewayException } from '@nestjs/common';
import {
  SorobanFeeEstimationService,
  FEE_ESTIMATION_LIMITATIONS_DISCLAIMER,
} from './soroban-fee-estimation.service';
import { StellarService } from '../stellar/stellar.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';

const mockSimulateTransaction = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  const mockTx = { toXDR: jest.fn().mockReturnValue('mock-xdr') };
  const mockBuilder = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue(mockTx),
  };

  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: jest.fn().mockImplementation(() => ({
        simulateTransaction: mockSimulateTransaction,
      })),
      Api: {
        ...actual.rpc.Api,
        isSimulationError: jest.fn((sim: any) => Boolean(sim && sim.error)),
        isSimulationSuccess: jest.fn((sim: any) => Boolean(sim && !sim.error)),
      },
    },
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn((fnName: string, ...args: any[]) => ({ fnName, args })),
    })),
    Account: jest.fn().mockImplementation(() => ({})),
    TransactionBuilder: jest.fn().mockImplementation(() => mockBuilder),
    TimeoutInfinite: 0,
  };
});

describe('SorobanFeeEstimationService (#1091)', () => {
  let service: SorobanFeeEstimationService;
  let mockStellarService: Partial<StellarService>;
  let mockCircuitBreaker: Partial<CircuitBreakerService>;

  const VALID_WALLET_1 =
    'GDFWJ5C2UFWAJ7XF3UXUEV265MVDLD6BFG7PIT2LH23ARPHDYHC6FGL3';
  const VALID_WALLET_2 =
    'GBNPOM4M743X245Y44SAK5TWQGBSWI4YCSRSFDH66PEI4U7NMNU23GYM';

  beforeEach(() => {
    jest.clearAllMocks();

    mockStellarService = {
      network: 'testnet',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    };

    mockCircuitBreaker = {
      execute: jest.fn().mockImplementation((_config, fn) => fn()),
    };

    service = new SorobanFeeEstimationService(
      mockStellarService as StellarService,
      mockCircuitBreaker as CircuitBreakerService,
    );
  });

  describe('estimate_mint_fee', () => {
    it('returns approximate stroop cost, unit, network, timestamp, limitations, and breakdown', async () => {
      mockSimulateTransaction.mockResolvedValueOnce({
        minResourceFee: '15400',
        cost: { cpuInsns: '1250000', memBytes: '45000' },
      });

      const result = await service.estimate_mint_fee();

      expect(result.operation).toBe('mint');
      // 15400 (resource fee) + 100 (base fee) = 15500 stroops
      expect(result.estimatedFee).toBe('15500');
      expect(result.unit).toBe('stroops');
      expect(result.network).toBe('testnet');
      expect(typeof result.timestamp).toBe('string');
      expect(result.limitations).toBe(FEE_ESTIMATION_LIMITATIONS_DISCLAIMER);
      expect(result.estimatedFeeXlm).toBe('0.0015500');
      expect(result.breakdown).toEqual({
        baseFeeStroops: '100',
        resourceFeeStroops: '15400',
        cpuInstructions: 1250000,
        memoryBytes: 45000,
      });
    });

    it('uses provided query parameters when supplied', async () => {
      mockSimulateTransaction.mockResolvedValueOnce({
        minResourceFee: '18000',
      });

      const customQuery = {
        walletAddress: VALID_WALLET_1,
        clipId: 42,
        collectionId: 'vip-collection',
      };

      const result = await service.estimate_mint_fee(customQuery);

      expect(result.estimatedFee).toBe('18100');
      expect(result.estimatedFeeXlm).toBe('0.0018100');
    });

    it('handles zero or missing resource fee gracefully', async () => {
      mockSimulateTransaction.mockResolvedValueOnce({});

      const result = await service.estimate_mint_fee();

      expect(result.estimatedFee).toBe('100'); // only base fee
      expect(result.breakdown?.resourceFeeStroops).toBe('0');
    });

    it('throws BadGatewayException when simulation returns an error', async () => {
      mockSimulateTransaction.mockResolvedValue({
        error: 'HostError: Error(Contract, #1)',
      });

      await expect(service.estimate_mint_fee()).rejects.toThrow(
        BadGatewayException,
      );
      await expect(service.estimate_mint_fee()).rejects.toThrow(
        /Soroban mint fee estimation simulation failed/i,
      );
    });

    it('throws BadGatewayException when RPC call throws network exception', async () => {
      mockSimulateTransaction.mockRejectedValue(
        new Error('Connection timed out'),
      );

      await expect(service.estimate_mint_fee()).rejects.toThrow(
        BadGatewayException,
      );
      await expect(service.estimate_mint_fee()).rejects.toThrow(
        /Failed to estimate mint fee from Soroban RPC: Connection timed out/i,
      );
    });

    it('camelCase alias estimateMintFee works identically', async () => {
      mockSimulateTransaction.mockResolvedValueOnce({
        minResourceFee: '20000',
      });

      const result = await service.estimateMintFee();
      expect(result.estimatedFee).toBe('20100');
    });
  });

  describe('estimate_transfer_fee', () => {
    it('returns approximate stroop cost, unit, network, timestamp, limitations, and breakdown', async () => {
      mockSimulateTransaction.mockResolvedValueOnce({
        minResourceFee: '9500',
        cost: { cpuInsns: '890000', memBytes: '32000' },
      });

      const result = await service.estimate_transfer_fee();

      expect(result.operation).toBe('transfer');
      // 9500 (resource fee) + 100 (base fee) = 9600 stroops
      expect(result.estimatedFee).toBe('9600');
      expect(result.unit).toBe('stroops');
      expect(result.network).toBe('testnet');
      expect(typeof result.timestamp).toBe('string');
      expect(result.limitations).toBe(FEE_ESTIMATION_LIMITATIONS_DISCLAIMER);
      expect(result.estimatedFeeXlm).toBe('0.0009600');
      expect(result.breakdown).toEqual({
        baseFeeStroops: '100',
        resourceFeeStroops: '9500',
        cpuInstructions: 890000,
        memoryBytes: 32000,
      });
    });

    it('uses custom transfer query parameters when supplied', async () => {
      mockSimulateTransaction.mockResolvedValueOnce({
        minResourceFee: '11200',
      });

      const query = {
        fromWallet: VALID_WALLET_1,
        toWallet: VALID_WALLET_2,
        tokenId: 99,
      };

      const result = await service.estimate_transfer_fee(query);

      expect(result.estimatedFee).toBe('11300');
    });

    it('throws BadGatewayException when transfer simulation returns an error', async () => {
      mockSimulateTransaction.mockResolvedValue({
        error: 'Simulation contract invocation rejected: Not authorized',
      });

      await expect(service.estimate_transfer_fee()).rejects.toThrow(
        BadGatewayException,
      );
      await expect(service.estimate_transfer_fee()).rejects.toThrow(
        /Soroban transfer fee estimation simulation failed/i,
      );
    });

    it('throws BadGatewayException when RPC connection fails', async () => {
      mockSimulateTransaction.mockRejectedValue(
        new Error('RPC 503 Service Unavailable'),
      );

      await expect(service.estimate_transfer_fee()).rejects.toThrow(
        BadGatewayException,
      );
    });

    it('camelCase alias estimateTransferFee works identically', async () => {
      mockSimulateTransaction.mockResolvedValueOnce({
        minResourceFee: '8000',
      });

      const result = await service.estimateTransferFee();
      expect(result.estimatedFee).toBe('8100');
    });
  });
});
