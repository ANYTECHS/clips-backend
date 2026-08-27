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
  verifySignatureOwnership: jest.fn(),
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
    mockWalletValidationService.verifySignatureOwnership.mockImplementation(
      () => undefined,
    );
    mockPrisma.wallet.findUnique.mockResolvedValue(null);
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
    publicKey: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
    signature: 'sig-base64',
    signedMessage: 'Connect ClipCash wallet 1719266696836',
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
      publicKey: stellarDto.publicKey,
      signature: stellarDto.signature,
      signedMessage: stellarDto.signedMessage,
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

  it('verifies the signature and requires publicKey to match address for stellar', async () => {
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: 1,
      userId: 42,
      ...stellarDto,
    });

    await service.connect(42, stellarDto);

    expect(
      mockWalletValidationService.verifySignatureOwnership,
    ).toHaveBeenCalledWith(
      stellarDto.publicKey,
      stellarDto.signature,
      stellarDto.signedMessage,
    );
  });

  it('rejects a stellar connect when publicKey does not match address', async () => {
    await expect(
      service.connect(42, { ...stellarDto, publicKey: 'GDIFFERENTKEY' }),
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.wallet.upsert).not.toHaveBeenCalled();
  });

  it('rejects when signature verification fails', async () => {
    mockWalletValidationService.verifySignatureOwnership.mockImplementation(
      () => {
        throw new BadRequestException('Signature verification failed');
      },
    );
    await expect(service.connect(42, stellarDto)).rejects.toThrow(
      BadRequestException,
    );
    expect(mockPrisma.wallet.upsert).not.toHaveBeenCalled();
  });

  it('rejects connecting a wallet address already owned by another user', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue({
      ...baseWallet,
      address: stellarDto.address,
      userId: 99,
    });

    await expect(service.connect(42, stellarDto)).rejects.toThrow(
      ConflictException,
    );
    expect(mockPrisma.wallet.upsert).not.toHaveBeenCalled();
  });

  it('allows the same user to reconnect their own wallet', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue({
      ...baseWallet,
      address: stellarDto.address,
      userId: 42,
    });
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: 1,
      userId: 42,
      ...stellarDto,
    });

    await expect(service.connect(42, stellarDto)).resolves.toBeDefined();
    expect(mockPrisma.wallet.upsert).toHaveBeenCalled();
  });

  it.each(SUPPORTED_CHAINS)(
    'upserts a wallet for each supported chain "%s"',
    async (chain) => {
      const dto = {
        address: stellarDto.address,
        chain,
        type: 'freighter',
        publicKey: stellarDto.address,
        signature: stellarDto.signature,
        signedMessage: stellarDto.signedMessage,
      };
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
      publicKey: fullAddress,
    });

    expect(result.address).not.toBe(fullAddress);
    expect(result.address).toContain('****');
  });
});
