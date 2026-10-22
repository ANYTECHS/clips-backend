import { SorobanContractController } from './soroban-contract.controller';

describe('SorobanContractController', () => {
  const stellarService = {
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };
  const adminContractService = {
    getContractMetadata: jest.fn(),
    getContractVersion: jest.fn(),
    getPauseInfo: jest.fn(),
    getPauseReason: jest.fn(),
  };
  let controller: SorobanContractController;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SOROBAN_NFT_CONTRACT_ID;
    controller = new SorobanContractController(
      stellarService as any,
      adminContractService as any,
    );
  });

  it('returns current contract metadata from the contract service', async () => {
    const metadata = {
      name: 'ClipCash NFT',
      symbol: 'CLIP',
      version: '0.1.0',
      owner: 'GADMIN',
      platform_fee: 500,
    };
    adminContractService.getContractMetadata.mockResolvedValue(metadata);

    await expect(controller.getContractInfo()).resolves.toEqual(metadata);
    expect(adminContractService.getContractMetadata).toHaveBeenCalledTimes(1);
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
});