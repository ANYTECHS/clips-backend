import { SorobanContractController } from './soroban-contract.controller';

describe('SorobanContractController', () => {
  const stellarService = {
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };
  const adminContractService = {
    getContractVersion: jest.fn(),
    getPauseInfo: jest.fn(),
    getPauseReason: jest.fn(),
  };
  const feeEstimationService = {
    estimate_mint_fee: jest.fn(),
    estimate_transfer_fee: jest.fn(),
  };

  let controller: SorobanContractController;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SOROBAN_NFT_CONTRACT_ID;
    controller = new SorobanContractController(
      stellarService as any,
      adminContractService as any,
      feeEstimationService as any,
    );
  });

  it('returns configured public contract information', () => {
    process.env.SOROBAN_NFT_CONTRACT_ID = 'C'.padEnd(56, 'A');

    expect(controller.getContractInfo()).toEqual({
      contractId: 'C'.padEnd(56, 'A'),
      network: 'testnet',
      rpcUrl: stellarService.rpcUrl,
      networkPassphrase: stellarService.networkPassphrase,
      explorerUrl: `https://stellar.expert/explorer/testnet/contract/${'C'.padEnd(56, 'A')}`,
    });
  });

  it('delegates version reads to the on-chain contract service', async () => {
    const version = { contractId: 'C'.padEnd(56, 'A'), version: '2.0.0' };
    adminContractService.getContractVersion.mockResolvedValue(version);

    await expect(controller.getContractVersion()).resolves.toEqual(version);
    expect(adminContractService.getContractVersion).toHaveBeenCalledTimes(1);
  });

  it('returns pause status and reason from the on-chain contract service', async () => {
    const pauseInfo = {
      paused: true,
      reason: 'Scheduled contract maintenance',
    };
    adminContractService.getPauseInfo.mockResolvedValue(pauseInfo);

    await expect(controller.getPauseInfo()).resolves.toEqual(pauseInfo);
    expect(adminContractService.getPauseInfo).toHaveBeenCalledTimes(1);
  });

  it('returns the pause reason from the on-chain contract service', async () => {
    adminContractService.getPauseReason.mockResolvedValue(
      'Scheduled contract maintenance',
    );

    await expect(controller.getPauseReason()).resolves.toEqual({
      reason: 'Scheduled contract maintenance',
    });
    expect(adminContractService.getPauseReason).toHaveBeenCalledTimes(1);
  });

  describe('GET /soroban/fees/mint (#1091)', () => {
    it('delegates mint fee estimation to feeEstimationService', async () => {
      const mockEstimate = {
        operation: 'mint' as const,
        estimatedFee: '15500',
        unit: 'stroops',
        network: 'testnet',
        timestamp: '2026-10-22T09:30:00.000Z',
        limitations: 'Estimates are approximate',
        estimatedFeeXlm: '0.0015500',
      };
      feeEstimationService.estimate_mint_fee.mockResolvedValue(mockEstimate);

      const query = { clipId: 10, collectionId: 'default' };
      const result = await controller.estimateMintFee(query);

      expect(feeEstimationService.estimate_mint_fee).toHaveBeenCalledWith(
        query,
      );
      expect(result).toEqual(mockEstimate);
    });

    it('throws when feeEstimationService is not provided', () => {
      const unconfiguredController = new SorobanContractController(
        stellarService as any,
        adminContractService as any,
      );

      expect(() => unconfiguredController.estimateMintFee()).toThrow(
        'SorobanFeeEstimationService is not available',
      );
    });
  });

  describe('GET /soroban/fees/transfer (#1091)', () => {
    it('delegates transfer fee estimation to feeEstimationService', async () => {
      const mockEstimate = {
        operation: 'transfer' as const,
        estimatedFee: '9600',
        unit: 'stroops',
        network: 'testnet',
        timestamp: '2026-10-22T09:30:00.000Z',
        limitations: 'Estimates are approximate',
        estimatedFeeXlm: '0.0009600',
      };
      feeEstimationService.estimate_transfer_fee.mockResolvedValue(
        mockEstimate,
      );

      const query = { tokenId: 42 };
      const result = await controller.estimateTransferFee(query);

      expect(feeEstimationService.estimate_transfer_fee).toHaveBeenCalledWith(
        query,
      );
      expect(result).toEqual(mockEstimate);
    });

    it('throws when feeEstimationService is not provided', () => {
      const unconfiguredController = new SorobanContractController(
        stellarService as any,
        adminContractService as any,
      );

      expect(() => unconfiguredController.estimateTransferFee()).toThrow(
        'SorobanFeeEstimationService is not available',
      );
    });
  });
});
