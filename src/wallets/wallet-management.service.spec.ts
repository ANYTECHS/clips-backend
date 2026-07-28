import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { WalletManagementService } from './wallet-management.service';
import { WalletValidationService } from './wallet-validation.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CHAIN, SUPPORTED_CHAINS } from './chain.constants';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const mockPrisma = {
  wallet: {
    findUnique: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  payout: {
    findFirst: jest.fn(),
  },
  clip: {
    findFirst: jest.fn(),
  },
};

const mockWalletValidationService = {
  validateStellarAddress: jest.fn(),
  validateAddressForChain: jest.fn(),
};

const baseWallet = {
  id: 1,
  userId: 42,
  address: 'GXYZ',
  chain: 'stellar',
  type: 'custodial',
  deletedAt: null,
  connectedAt: new Date(),
  updatedAt: new Date(),
  payouts: [],
};

describe('WalletManagementService.disconnect', () => {
  let service: WalletManagementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWalletValidationService.validateAddressForChain.mockImplementation(
      () => undefined,
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletManagementService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: WalletValidationService,
          useValue: mockWalletValidationService,
        },
      ],
    }).compile();
    service = module.get<WalletManagementService>(WalletManagementService);
  });

  it('throws NotFoundException when wallet does not exist', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue(null);
    await expect(service.disconnect(99, 42)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when wallet belongs to another user', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue({
      ...baseWallet,
      userId: 99,
    });
    await expect(service.disconnect(1, 42)).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException when wallet is already disconnected', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue({
      ...baseWallet,
      deletedAt: new Date(),
    });
    await expect(service.disconnect(1, 42)).rejects.toThrow(ConflictException);
  });

  it('throws ConflictException when pending payouts exist', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue({
      ...baseWallet,
      payouts: [{ id: 5, status: 'pending' }],
    });
    mockPrisma.clip.findFirst.mockResolvedValue(null);
    await expect(service.disconnect(1, 42)).rejects.toThrow(ConflictException);
  });

  it('throws ConflictException when active NFTs exist', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue(baseWallet);
    mockPrisma.clip.findFirst.mockResolvedValue({ id: 9 });

    await expect(service.disconnect(1, 42)).rejects.toThrow(ConflictException);
  });

  it('soft-deletes the wallet and returns success message', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue(baseWallet);
    mockPrisma.clip.findFirst.mockResolvedValue(null);
    mockPrisma.wallet.update.mockResolvedValue({
      ...baseWallet,
      deletedAt: new Date(),
    });

    const result = await service.disconnect(1, 42);

    expect(mockPrisma.wallet.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    });
    expect(result).toEqual({
      message: 'Wallet disconnected successfully',
      walletId: 1,
    });
  });
});

describe('WalletManagementService.connect', () => {
  let service: WalletManagementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWalletValidationService.validateAddressForChain.mockImplementation(
      () => undefined,
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletManagementService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: WalletValidationService,
          useValue: mockWalletValidationService,
        },
      ],
    }).compile();
    service = module.get<WalletManagementService>(WalletManagementService);
  });

  const stellarDto = {
    address: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
    chain: 'stellar' as const,
    type: 'freighter',
  };

  it('rejects unsupported chain values before touching the database', async () => {
    mockWalletValidationService.validateAddressForChain.mockImplementation(
      () => {
        throw new BadRequestException(
          'chain must be one of: stellar, solana, base',
        );
      },
    );
    await expect(
      service.connect(42, { ...stellarDto, chain: 'ethereum' as any }),
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.wallet.upsert).not.toHaveBeenCalled();
  });

  it('defaults chain to stellar when not provided', async () => {
    const dtoWithoutChain = {
      address: stellarDto.address,
      type: stellarDto.type,
    };
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: 1,
      ...dtoWithoutChain,
      chain: DEFAULT_CHAIN,
    });

    await service.connect(42, dtoWithoutChain as any);

    expect(mockPrisma.wallet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          address_chain: {
            address: stellarDto.address,
            chain: DEFAULT_CHAIN,
          },
        },
        create: expect.objectContaining({ chain: DEFAULT_CHAIN }),
      }),
    );
  });

  it('calls validateAddressForChain with the resolved chain', async () => {
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: 1,
      userId: 42,
      ...stellarDto,
    });

    await service.connect(42, stellarDto);

    expect(
      mockWalletValidationService.validateAddressForChain,
    ).toHaveBeenCalledWith(stellarDto.address, 'stellar');
  });

  it('aborts when validateAddressForChain throws', async () => {
    mockWalletValidationService.validateAddressForChain.mockImplementation(
      () => {
        throw new BadRequestException('Invalid Stellar address format');
      },
    );
    await expect(service.connect(42, stellarDto)).rejects.toThrow(
      BadRequestException,
    );
    expect(mockPrisma.wallet.upsert).not.toHaveBeenCalled();
  });

  it('upserts a stellar wallet with explicit chain after validation', async () => {
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: 1,
      userId: 42,
      ...stellarDto,
    });

    const result = await service.connect(42, stellarDto);

    expect(mockPrisma.wallet.upsert).toHaveBeenCalledWith({
      where: {
        address_chain: {
          address: stellarDto.address,
          chain: 'stellar',
        },
      },
      update: expect.objectContaining({
        userId: 42,
        type: stellarDto.type,
        deletedAt: null,
      }),
      create: {
        userId: 42,
        address: stellarDto.address,
        chain: 'stellar',
        type: stellarDto.type,
      },
    });
    expect(result.id).toBe(1);
  });

  it.each(SUPPORTED_CHAINS)(
    'upserts a wallet for each supported chain "%s"',
    async (chain) => {
      const dto = { address: stellarDto.address, chain, type: 'freighter' };
      mockPrisma.wallet.upsert.mockResolvedValue({ id: 1, userId: 42, ...dto });

      await service.connect(42, dto);

      expect(mockPrisma.wallet.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ chain }),
        }),
      );
    },
  );

  it('masks the wallet address in the response', async () => {
    const fullAddress =
      'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: 1,
      userId: 42,
      address: fullAddress,
      chain: 'stellar',
      type: 'freighter',
    });

    const result = await service.connect(42, {
      ...stellarDto,
      address: fullAddress,
    });

    expect(result.address).not.toBe(fullAddress);
    expect(result.address).toContain('****');
  });
});
