import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { StellarService } from '../stellar/stellar.service';
import { BadRequestException } from '@nestjs/common';

export type UserPlatformCreateInput = {
  userId: number;
  platform: string;
  username?: string;
  accessToken?: string;
  refreshToken?: string;
  stellarAddress?: string;
};

export type UserPlatformUpdateInput = {
  platform?: string;
  username?: string;
  accessToken?: string;
  refreshToken?: string;
};

@Injectable()
export class UserPlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly stellarService: StellarService,
  ) {}

  async create(data: UserPlatformCreateInput) {
    if (data.stellarAddress) {
      const validation = this.stellarService.validateAddress(data.stellarAddress);
      if (!validation.valid) {
        throw new BadRequestException('Invalid Stellar address format');
      }
    }

    // Encrypt sensitive fields before storing
    const encryptedData = this.encryptionService.encryptObjectFields(data, [
      'accessToken',
      'refreshToken',
    ]);

    return this.prisma.userPlatform.create({
      data: encryptedData,
    });
  }

  async findAll(userId: number) {
    const platforms = await this.prisma.userPlatform.findMany({
      where: { userId },
    });

    // Decrypt sensitive fields before returning
    return platforms.map(platform =>
      this.encryptionService.decryptObjectFields(platform, [
        'accessToken',
        'refreshToken',
      ]),
    );
  }

  async findOne(id: number, userId?: number) {
    const platform = await this.prisma.userPlatform.findUnique({
      where: { id },
    });

    if (!platform) {
      throw new Error('UserPlatform not found');
    }

    if (userId && platform.userId !== userId) {
      throw new Error('Access denied');
    }

    // Decrypt sensitive fields before returning
    return this.encryptionService.decryptObjectFields(platform, [
      'accessToken',
      'refreshToken',
    ]);
  }

  async findByPlatform(userId: number, platform: string) {
    const userPlatform = await this.prisma.userPlatform.findFirst({
      where: { userId, platform },
    });

    if (!userPlatform) {
      return null;
    }

    // Decrypt sensitive fields before returning
    return this.encryptionService.decryptObjectFields(userPlatform, [
      'accessToken',
      'refreshToken',
    ]);
  }

  async update(id: number, data: UserPlatformUpdateInput, userId?: number) {
    // First check if the platform exists and user has access
    const existing = await this.prisma.userPlatform.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('UserPlatform not found');
    }

    if (userId && existing.userId !== userId) {
      throw new Error('Access denied');
    }

    // Encrypt sensitive fields before updating
    const encryptedData = this.encryptionService.encryptObjectFields(data, [
      'accessToken',
      'refreshToken',
    ]);

    const updated = await this.prisma.userPlatform.update({
      where: { id },
      data: encryptedData,
    });

    // Decrypt sensitive fields before returning
    return this.encryptionService.decryptObjectFields(updated, [
      'accessToken',
      'refreshToken',
    ]);
  }

  async remove(id: number, userId?: number) {
    // First check if the platform exists and user has access
    const existing = await this.prisma.userPlatform.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('UserPlatform not found');
    }

    if (userId && existing.userId !== userId) {
      throw new Error('Access denied');
    }

    return this.prisma.userPlatform.delete({
      where: { id },
    });
  }

  async migrateExistingRecords() {
    // This method is for migrating existing unencrypted records
    const platforms = await this.prisma.userPlatform.findMany({
      where: {
        OR: [
          { accessToken: { not: null } },
          { refreshToken: { not: null } },
        ],
      },
    });

    for (const platform of platforms) {
      const needsEncryption: string[] = [];
      
      // Check if accessToken needs encryption (simple heuristic: if it's not base64 with our format)
      if (platform.accessToken && !this.isEncrypted(platform.accessToken)) {
        needsEncryption.push('accessToken');
      }
      
      if (platform.refreshToken && !this.isEncrypted(platform.refreshToken)) {
        needsEncryption.push('refreshToken');
      }

      if (needsEncryption.length > 0) {
        const encryptedData = this.encryptionService.encryptObjectFields(
          platform,
          needsEncryption as any[],
        );

        await this.prisma.userPlatform.update({
          where: { id: platform.id },
          data: {
            ...(encryptedData.accessToken && { accessToken: encryptedData.accessToken }),
            ...(encryptedData.refreshToken && { refreshToken: encryptedData.refreshToken }),
          },
        });
      }
    }

    return { migrated: platforms.length };
  }

  private isEncrypted(value: string): boolean {
    if (!value) return false;
    
    try {
      // Try to decode as base64 and check if it has our expected structure
      const decoded = Buffer.from(value, 'base64');
      // Our encrypted format: IV (16 bytes) + authTag (16 bytes) + encrypted data
      return decoded.length >= 32;
    } catch {
      return false;
    }
  }
}
