import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayoutMethodService } from './payout-method.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { CreatePayoutMethodDto } from './dto/create-payout-method.dto';
import { UpdatePayoutMethodDto } from './dto/update-payout-method.dto';

describe('PayoutMethodService', () => {
  let service: PayoutMethodService;
  let prismaService: PrismaService;
  let encryptionService: EncryptionService;

  const mockPrismaService = {
    payoutMethod: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockEncryptionService = {
    encrypt: jest.fn((text: string) => `encrypted_${text}`),
    decrypt: jest.fn((text: string) => text.replace('encrypted_', '')),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutMethodService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
      ],
    }).compile();

    service = module.get<PayoutMethodService>(PayoutMethodService);
    prismaService = module.get<PrismaService>(PrismaService);
    encryptionService = module.get<EncryptionService>(EncryptionService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a payout method with encrypted sensitive data', async () => {
      const userId = 1;
      const dto: CreatePayoutMethodDto = {
        type: 'bank_account',
        accountNumber: '1234567890',
        routingNumber: '021000021',
        bankName: 'Chase Bank',
        accountHolderName: 'John Doe',
        country: 'US',
        currency: 'USD',
        isDefault: false,
      };

      const mockCreatedMethod = {
        id: 1,
        userId,
        type: dto.type,
        isDefault: false,
        encryptedAccountNumber: 'encrypted_1234567890',
        encryptedRoutingNumber: 'encrypted_021000021',
        encryptedSwiftCode: null,
        encryptedIban: null,
        bankName: dto.bankName,
        accountHolderName: dto.accountHolderName,
        country: dto.country,
        currency: dto.currency,
        lastFourDigits: '7890',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockPrismaService.payoutMethod.create.mockResolvedValue(
        mockCreatedMethod,
      );

      const result = await service.create(userId, dto);

      expect(encryptionService.encrypt).toHaveBeenCalledWith(dto.accountNumber);
      expect(encryptionService.encrypt).toHaveBeenCalledWith(dto.routingNumber);
      expect(prismaService.payoutMethod.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          type: dto.type,
          encryptedAccountNumber: 'encrypted_1234567890',
          encryptedRoutingNumber: 'encrypted_021000021',
          bankName: dto.bankName,
          accountHolderName: dto.accountHolderName,
          lastFourDigits: '7890',
        }),
      });
      expect(result).toEqual({
        id: 1,
        type: dto.type,
        isDefault: false,
        bankName: dto.bankName,
        accountHolderName: dto.accountHolderName,
        country: dto.country,
        currency: dto.currency,
        lastFourDigits: '7890',
        createdAt: mockCreatedMethod.createdAt,
        updatedAt: mockCreatedMethod.updatedAt,
      });
    });

    it('should throw BadRequestException if neither accountNumber nor iban is provided', async () => {
      const userId = 1;
      const dto: CreatePayoutMethodDto = {
        type: 'bank_account',
        bankName: 'Chase Bank',
      };

      await expect(service.create(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should unset other default methods when creating a new default', async () => {
      const userId = 1;
      const dto: CreatePayoutMethodDto = {
        type: 'bank_account',
        accountNumber: '1234567890',
        isDefault: true,
      };

      const mockCreatedMethod = {
        id: 2,
        userId,
        type: dto.type,
        isDefault: true,
        encryptedAccountNumber: 'encrypted_1234567890',
        encryptedRoutingNumber: null,
        encryptedSwiftCode: null,
        encryptedIban: null,
        bankName: null,
        accountHolderName: null,
        country: null,
        currency: 'USD',
        lastFourDigits: '7890',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockPrismaService.payoutMethod.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.payoutMethod.create.mockResolvedValue(
        mockCreatedMethod,
      );

      await service.create(userId, dto);

      expect(prismaService.payoutMethod.updateMany).toHaveBeenCalledWith({
        where: { userId, isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
    });

    it('should handle IBAN-based payout methods', async () => {
      const userId = 1;
      const dto: CreatePayoutMethodDto = {
        type: 'wire_transfer',
        iban: 'GB29NWBK60161331926819',
        swiftCode: 'CHASUS33',
        bankName: 'International Bank',
        country: 'GB',
      };

      const mockCreatedMethod = {
        id: 3,
        userId,
        type: dto.type,
        isDefault: false,
        encryptedAccountNumber: null,
        encryptedRoutingNumber: null,
        encryptedSwiftCode: 'encrypted_CHASUS33',
        encryptedIban: 'encrypted_GB29NWBK60161331926819',
        bankName: dto.bankName,
        accountHolderName: null,
        country: dto.country,
        currency: 'USD',
        lastFourDigits: '6819',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockPrismaService.payoutMethod.create.mockResolvedValue(
        mockCreatedMethod,
      );

      const result = await service.create(userId, dto);

      expect(encryptionService.encrypt).toHaveBeenCalledWith(dto.iban);
      expect(encryptionService.encrypt).toHaveBeenCalledWith(dto.swiftCode);
      expect(result.lastFourDigits).toBe('6819');
    });
  });

  describe('findAll', () => {
    it('should return all non-deleted payout methods for a user', async () => {
      const userId = 1;
      const mockMethods = [
        {
          id: 1,
          userId,
          type: 'bank_account',
          isDefault: true,
          encryptedAccountNumber: 'encrypted_1234567890',
          encryptedRoutingNumber: 'encrypted_021000021',
          encryptedSwiftCode: null,
          encryptedIban: null,
          bankName: 'Chase Bank',
          accountHolderName: 'John Doe',
          country: 'US',
          currency: 'USD',
          lastFourDigits: '7890',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        {
          id: 2,
          userId,
          type: 'wire_transfer',
          isDefault: false,
          encryptedAccountNumber: null,
          encryptedRoutingNumber: null,
          encryptedSwiftCode: 'encrypted_SWIFT',
          encryptedIban: 'encrypted_IBAN',
          bankName: 'International Bank',
          accountHolderName: 'John Doe',
          country: 'GB',
          currency: 'GBP',
          lastFourDigits: '1234',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      mockPrismaService.payoutMethod.findMany.mockResolvedValue(mockMethods);

      const result = await service.findAll(userId);

      expect(prismaService.payoutMethod.findMany).toHaveBeenCalledWith({
        where: { userId, deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('encryptedAccountNumber');
      expect(result[0]).toHaveProperty('lastFourDigits', '7890');
    });
  });

  describe('findOne', () => {
    it('should return a specific payout method without sensitive data', async () => {
      const userId = 1;
      const methodId = 1;
      const mockMethod = {
        id: methodId,
        userId,
        type: 'bank_account',
        isDefault: true,
        encryptedAccountNumber: 'encrypted_1234567890',
        encryptedRoutingNumber: 'encrypted_021000021',
        encryptedSwiftCode: null,
        encryptedIban: null,
        bankName: 'Chase Bank',
        accountHolderName: 'John Doe',
        country: 'US',
        currency: 'USD',
        lastFourDigits: '7890',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockPrismaService.payoutMethod.findFirst.mockResolvedValue(mockMethod);

      const result = await service.findOne(methodId, userId);

      expect(prismaService.payoutMethod.findFirst).toHaveBeenCalledWith({
        where: { id: methodId, userId, deletedAt: null },
      });
      expect(result).not.toHaveProperty('encryptedAccountNumber');
      expect(result.lastFourDigits).toBe('7890');
    });

    it('should throw NotFoundException if method does not exist', async () => {
      const userId = 1;
      const methodId = 999;

      mockPrismaService.payoutMethod.findFirst.mockResolvedValue(null);

      await expect(service.findOne(methodId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for soft-deleted method', async () => {
      const userId = 1;
      const methodId = 1;

      mockPrismaService.payoutMethod.findFirst.mockResolvedValue(null);

      await expect(service.findOne(methodId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOneWithSensitiveData', () => {
    it('should return payout method with decrypted sensitive data', async () => {
      const userId = 1;
      const methodId = 1;
      const mockMethod = {
        id: methodId,
        userId,
        type: 'bank_account',
        isDefault: true,
        encryptedAccountNumber: 'encrypted_1234567890',
        encryptedRoutingNumber: 'encrypted_021000021',
        encryptedSwiftCode: null,
        encryptedIban: null,
        bankName: 'Chase Bank',
        accountHolderName: 'John Doe',
        country: 'US',
        currency: 'USD',
        lastFourDigits: '7890',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockPrismaService.payoutMethod.findFirst.mockResolvedValue(mockMethod);

      const result = await service.findOneWithSensitiveData(methodId, userId);

      expect(encryptionService.decrypt).toHaveBeenCalledWith(
        'encrypted_1234567890',
      );
      expect(encryptionService.decrypt).toHaveBeenCalledWith(
        'encrypted_021000021',
      );
      expect(result.accountNumber).toBe('1234567890');
      expect(result.routingNumber).toBe('021000021');
    });

    it('should throw NotFoundException for soft-deleted method', async () => {
      const userId = 1;
      const methodId = 1;
      const mockMethod = {
        id: methodId,
        userId,
        type: 'bank_account',
        isDefault: true,
        encryptedAccountNumber: 'encrypted_1234567890',
        encryptedRoutingNumber: 'encrypted_021000021',
        encryptedSwiftCode: null,
        encryptedIban: null,
        bankName: 'Chase Bank',
        accountHolderName: 'John Doe',
        country: 'US',
        currency: 'USD',
        lastFourDigits: '7890',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };

      mockPrismaService.payoutMethod.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneWithSensitiveData(methodId, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update non-sensitive fields', async () => {
      const userId = 1;
      const methodId = 1;
      const dto: UpdatePayoutMethodDto = {
        bankName: 'Updated Bank',
        isDefault: true,
      };

      const existingMethod = {
        id: methodId,
        userId,
        type: 'bank_account',
        isDefault: false,
        encryptedAccountNumber: 'encrypted_1234567890',
        encryptedRoutingNumber: 'encrypted_021000021',
        encryptedSwiftCode: null,
        encryptedIban: null,
        bankName: 'Old Bank',
        accountHolderName: 'John Doe',
        country: 'US',
        currency: 'USD',
        lastFourDigits: '7890',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const updatedMethod = { ...existingMethod, ...dto };

      mockPrismaService.payoutMethod.findFirst.mockResolvedValue(
        existingMethod,
      );
      mockPrismaService.payoutMethod.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.payoutMethod.update.mockResolvedValue(updatedMethod);

      const result = await service.update(methodId, userId, dto);

      expect(prismaService.payoutMethod.update).toHaveBeenCalledWith({
        where: { id: methodId },
        data: expect.objectContaining({
          bankName: dto.bankName,
          isDefault: dto.isDefault,
        }),
      });
      expect(result.bankName).toBe('Updated Bank');
    });

    it('should throw NotFoundException if method does not exist', async () => {
      const userId = 1;
      const methodId = 999;
      const dto: UpdatePayoutMethodDto = { bankName: 'Updated Bank' };

      mockPrismaService.payoutMethod.findFirst.mockResolvedValue(null);

      await expect(service.update(methodId, userId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for soft-deleted method', async () => {
      const userId = 1;
      const methodId = 1;
      const dto: UpdatePayoutMethodDto = { bankName: 'Updated Bank' };

      mockPrismaService.payoutMethod.findFirst.mockResolvedValue(null);

      await expect(service.update(methodId, userId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should soft delete a payout method', async () => {
      const userId = 1;
      const methodId = 1;
      const mockMethod = {
        id: methodId,
        userId,
        type: 'bank_account',
        isDefault: false,
        deletedAt: null,
      };

      mockPrismaService.payoutMethod.findFirst.mockResolvedValue(mockMethod);
      mockPrismaService.payoutMethod.update.mockResolvedValue({
        ...mockMethod,
        deletedAt: new Date(),
      });

      const result = await service.remove(methodId, userId);

      expect(prismaService.payoutMethod.update).toHaveBeenCalledWith({
        where: { id: methodId },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result.message).toBe('Payout method deleted successfully');
    });

    it('should throw NotFoundException if method does not exist', async () => {
      const userId = 1;
      const methodId = 999;

      mockPrismaService.payoutMethod.findFirst.mockResolvedValue(null);

      await expect(service.remove(methodId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should use deletedAt: null filter to prevent re-deleting soft-deleted method', async () => {
      const userId = 1;
      const methodId = 1;

      mockPrismaService.payoutMethod.findFirst.mockResolvedValue(null);

      await expect(service.remove(methodId, userId)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrismaService.payoutMethod.findFirst).toHaveBeenCalledWith({
        where: { id: methodId, userId, deletedAt: null },
      });
    });
  });

  describe('getDefaultMethod', () => {
    it('should return the default payout method', async () => {
      const userId = 1;
      const mockMethod = {
        id: 1,
        userId,
        type: 'bank_account',
        isDefault: true,
        encryptedAccountNumber: 'encrypted_1234567890',
        encryptedRoutingNumber: 'encrypted_021000021',
        encryptedSwiftCode: null,
        encryptedIban: null,
        bankName: 'Chase Bank',
        accountHolderName: 'John Doe',
        country: 'US',
        currency: 'USD',
        lastFourDigits: '7890',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockPrismaService.payoutMethod.findFirst.mockResolvedValue(mockMethod);

      const result = await service.getDefaultMethod(userId);

      expect(prismaService.payoutMethod.findFirst).toHaveBeenCalledWith({
        where: { userId, isDefault: true, deletedAt: null },
      });
      expect(result).not.toBeNull();
      expect(result?.isDefault).toBe(true);
    });

    it('should return null if no default method exists', async () => {
      const userId = 1;

      mockPrismaService.payoutMethod.findFirst.mockResolvedValue(null);

      const result = await service.getDefaultMethod(userId);

      expect(result).toBeNull();
    });
  });
});
