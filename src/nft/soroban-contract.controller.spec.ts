import { SorobanContractController } from './soroban-contract.controller';

describe('SorobanContractController', () => {
  const stellarService = {
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };
  const adminContractService = {
    getContractVersion: jest.fn(),
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
});