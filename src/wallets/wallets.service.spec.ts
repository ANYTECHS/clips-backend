import { Test, TestingModule } from '@nestjs/testing';
import { WalletsService } from './wallets.service';
import { WalletManagementService } from './wallet-management.service';

const mockWalletManagementService = {
  disconnect: jest.fn(),
  connect: jest.fn(),
  listWallets: jest.fn(),
  findWallet: jest.fn(),
};

describe('WalletsService', () => {
  let service: WalletsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        {
          provide: WalletManagementService,
          useValue: mockWalletManagementService,
        },
      ],
    }).compile();
    service = module.get<WalletsService>(WalletsService);
  });

  it('delegates disconnect to WalletManagementService', async () => {
    const expected = { message: 'Wallet disconnected successfully', walletId: 1 };
    mockWalletManagementService.disconnect.mockResolvedValue(expected);

    const result = await service.disconnect(1, 42);

    expect(mockWalletManagementService.disconnect).toHaveBeenCalledWith(1, 42);
    expect(result).toEqual(expected);
  });

  it('delegates connect to WalletManagementService', async () => {
    const dto = {
      address: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      chain: 'stellar',
      type: 'freighter',
    };
    mockWalletManagementService.connect.mockResolvedValue({ id: 1, userId: 42, ...dto });

    const result = await service.connect(42, dto);

    expect(mockWalletManagementService.connect).toHaveBeenCalledWith(42, dto);
    expect(result.id).toBe(1);
  });

  it('delegates listWallets to WalletManagementService with masked addresses', async () => {
    const maskedWallets = [
      { id: 1, userId: 42, address: 'GC6X********TF3', chain: 'stellar', type: 'freighter' },
      { id: 2, userId: 42, address: 'GABC********XYZ', chain: 'stellar', type: 'lobstr' },
    ];
    mockWalletManagementService.listWallets.mockResolvedValue(maskedWallets);

    const result = await service.listWallets(42);

    expect(mockWalletManagementService.listWallets).toHaveBeenCalledWith(42);
    expect(result).toEqual(maskedWallets);
    expect(result).toHaveLength(2);
  });

  it('delegates findWallet to WalletManagementService with masked address', async () => {
    const maskedWallet = {
      id: 1,
      userId: 42,
      address: 'GC6X********TF3',
      chain: 'stellar',
      type: 'freighter',
    };
    mockWalletManagementService.findWallet.mockResolvedValue(maskedWallet);

    const result = await service.findWallet(1, 42);

    expect(mockWalletManagementService.findWallet).toHaveBeenCalledWith(1, 42);
    expect(result).toEqual(maskedWallet);
    expect(result.address).toContain('****');
  });
});
