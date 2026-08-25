import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClipRoyaltyService, MAX_ROYALTY_BPS } from './clip-royalty.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ClipRoyaltyService', () => {
  let service: ClipRoyaltyService;
  let prisma: PrismaService;

  const mockPrismaService = {
    clipRoyalty: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    clip: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClipRoyaltyService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ClipRoyaltyService>(ClipRoyaltyService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setRoyalty', () => {
    it('should set royalty with valid parameters', async () => {
      const clipId = 1;
      const recipientAddress = 'GBVP7D2V6DWXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
      const basisPoints = 1000;

      mockPrismaService.clip.findUnique.mockResolvedValue({ id: clipId });
      mockPrismaService.clipRoyalty.upsert.mockResolvedValue({
        clipId,
        recipientAddress,
        basisPoints,
        platformFeeBps: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.setRoyalty(
        clipId,
        recipientAddress,
        basisPoints,
      );

      expect(result.basisPoints).toBe(1000);
      expect(result.recipientAddress).toBe(recipientAddress);
      expect(prisma.clipRoyalty.upsert).toHaveBeenCalled();
    });

    it('should reject BPS > 1500 (15%)', async () => {
      const clipId = 1;
      const recipientAddress = 'GBVP7D2V6DWXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
      const basisPoints = 1501;

      mockPrismaService.clip.findUnique.mockResolvedValue({ id: clipId });

      await expect(
        service.setRoyalty(clipId, recipientAddress, basisPoints),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid Stellar address', async () => {
      const clipId = 1;
      const recipientAddress = 'INVALID_ADDRESS';
      const basisPoints = 1000;

      mockPrismaService.clip.findUnique.mockResolvedValue({ id: clipId });

      await expect(
        service.setRoyalty(clipId, recipientAddress, basisPoints),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if clip does not exist', async () => {
      const clipId = 999;
      const recipientAddress = 'GBVP7D2V6DWXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
      const basisPoints = 1000;

      mockPrismaService.clip.findUnique.mockResolvedValue(null);

      await expect(
        service.setRoyalty(clipId, recipientAddress, basisPoints),
      ).rejects.toThrow(NotFoundException);
    });

    it('should accept platform fee BPS', async () => {
      const clipId = 1;
      const recipientAddress = 'GBVP7D2V6DWXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
      const basisPoints = 1000;
      const platformFeeBps = 500;

      mockPrismaService.clip.findUnique.mockResolvedValue({ id: clipId });
      mockPrismaService.clipRoyalty.upsert.mockResolvedValue({
        clipId,
        recipientAddress,
        basisPoints,
        platformFeeBps,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.setRoyalty(
        clipId,
        recipientAddress,
        basisPoints,
        platformFeeBps,
      );

      expect(result.platformFeeBps).toBe(500);
    });
  });

  describe('getRoyalty', () => {
    it('should retrieve royalty for a clip', async () => {
      const clipId = 1;
      const mockRoyalty = {
        clipId,
        recipientAddress: 'GBVP7D2V6DWXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
        basisPoints: 1000,
        platformFeeBps: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.clipRoyalty.findUnique.mockResolvedValue(mockRoyalty);

      const result = await service.getRoyalty(clipId);

      expect(result).toEqual(mockRoyalty);
    });

    it('should return null if no royalty configured', async () => {
      mockPrismaService.clipRoyalty.findUnique.mockResolvedValue(null);

      const result = await service.getRoyalty(999);

      expect(result).toBeNull();
    });
  });

  describe('calculateRoyaltyAmount', () => {
    it('should calculate royalty amount correctly', () => {
      const salePrice = 1000000000; // 10 XLM in stroops
      const basisPoints = 1000; // 10%

      const result = service.calculateRoyaltyAmount(salePrice, basisPoints);

      expect(result).toBe(100000000); // 1 XLM
    });

    it('should return 0 for 0 sale price', () => {
      const salePrice = 0;
      const basisPoints = 1000;

      const result = service.calculateRoyaltyAmount(salePrice, basisPoints);

      expect(result).toBe(0);
    });

    it('should return 0 for 0 basis points', () => {
      const salePrice = 1000000000;
      const basisPoints = 0;

      const result = service.calculateRoyaltyAmount(salePrice, basisPoints);

      expect(result).toBe(0);
    });

    it('should reject negative sale price', () => {
      const salePrice = -1000000000;
      const basisPoints = 1000;

      expect(() =>
        service.calculateRoyaltyAmount(salePrice, basisPoints),
      ).toThrow(BadRequestException);
    });

    it('should reject BPS > 1500', () => {
      const salePrice = 1000000000;
      const basisPoints = 1501;

      expect(() =>
        service.calculateRoyaltyAmount(salePrice, basisPoints),
      ).toThrow(BadRequestException);
    });

    it('should use BigInt to prevent precision loss', () => {
      const salePrice = 9007199254740992; // Number.MAX_SAFE_INTEGER
      const basisPoints = 1000;

      // Should not throw due to precision loss
      expect(() =>
        service.calculateRoyaltyAmount(salePrice, basisPoints),
      ).not.toThrow();
    });
  });

  describe('validateRoyaltyConfiguration', () => {
    it('should validate valid configuration', () => {
      expect(() => {
        service.validateRoyaltyConfiguration(1000, 500);
      }).not.toThrow();
    });

    it('should reject BPS > 1500', () => {
      expect(() => {
        service.validateRoyaltyConfiguration(1501);
      }).toThrow(BadRequestException);
    });

    it('should reject negative BPS', () => {
      expect(() => {
        service.validateRoyaltyConfiguration(-100);
      }).toThrow(BadRequestException);
    });
  });

  describe('getRoyaltiesForRecipient', () => {
    it('should retrieve all royalties for a recipient', async () => {
      const address = 'GBVP7D2V6DWXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
      const mockRoyalties = [
        {
          clipId: 1,
          recipientAddress: address,
          basisPoints: 1000,
          platformFeeBps: 500,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          clipId: 2,
          recipientAddress: address,
          basisPoints: 500,
          platformFeeBps: 250,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.clipRoyalty.findMany.mockResolvedValue(mockRoyalties);

      const result = await service.getRoyaltiesForRecipient(address);

      expect(result).toHaveLength(2);
      expect(result[0].clipId).toBe(1);
      expect(result[1].clipId).toBe(2);
    });
  });
});
