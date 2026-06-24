import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { WalletManagementService } from './wallet-management.service';
import { WalletValidationService } from './wallet-validation.service';
import { PrismaService } from '../prisma/prisma.service';

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
};

const mockWalletValidationService = {
  validateStellarAddress: jest.fn(),
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
};

describe('WalletManagementService.disconnect', () => {
  let service: WalletManagementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWalletValidationService.validateStellarAddress.mockImplementation(() => undefined);
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
    mockPrisma.wallet.findUnique.mockResolvedValue({ ...baseWallet, userId: 99 });
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
    mockPrisma.wallet.findUnique.mockResolvedValue(baseWallet);
    mockPrisma.payout.findFirst.mockResolvedValue({ id: 5, status: 'pending' });
    await expect(service.disconnect(1, 42)).rejects.toThrow(ConflictException);
  });

  it('soft-deletes the wallet and returns success message', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue(baseWallet);
    mockPrisma.payout.findFirst.mockResolvedValue(null);
    mockPrisma.wallet.update.mockResolvedValue({ ...baseWallet, deletedAt: new Date() });

    const result = await service.disconnect(1, 42);

    expect(mockPrisma.wallet.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    });
    expect(result).toEqual({ message: 'Wallet disconnected successfully', walletId: 1 });
  });
});

describe('WalletManagementService.connect', () => {
  let service: WalletManagementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWalletValidationService.validateStellarAddress.mockImplementation(() => undefined);
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

  const dto = {
    address: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
    chain: 'stellar',
    type: 'freighter',
  };

  it('validates address before upsert', async () => {
    mockWalletValidationService.validateStellarAddress.mockImplementation(() => {
      throw new BadRequestException('Invalid Stellar address format');
    });
    await expect(service.connect(42, dto)).rejects.toThrow(BadRequestException);
    expect(mockPrisma.wallet.upsert).not.toHaveBeenCalled();
  });

  it('upserts a wallet after validation', async () => {
    mockPrisma.wallet.upsert.mockResolvedValue({ id: 1, userId: 42, ...dto });

    const result = await service.connect(42, dto);

    expect(mockWalletValidationService.validateStellarAddress).toHaveBeenCalledWith(
      dto.address,
    );
    expect(mockPrisma.wallet.upsert).toHaveBeenCalledWith({
      where: {
        address_chain: {
          address: dto.address,
          chain: dto.chain,
        },
      },
      update: expect.objectContaining({
        userId: 42,
        type: dto.type,
        deletedAt: null,
      }),
      create: {
        userId: 42,
        address: dto.address,
        chain: dto.chain,
        type: dto.type,
      },
    });
    expect(result.id).toBe(1);
  });
});
