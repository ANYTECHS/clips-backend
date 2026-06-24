import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { CreatePayoutMethodDto } from './dto/create-payout-method.dto';
import { UpdatePayoutMethodDto } from './dto/update-payout-method.dto';

export interface PayoutMethodResponse {
  id: number;
  type: string;
  isDefault: boolean;
  bankName: string | null;
  accountHolderName: string | null;
  country: string | null;
  currency: string;
  lastFourDigits: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayoutMethodWithSensitiveData extends PayoutMethodResponse {
  accountNumber?: string;
  routingNumber?: string;
  swiftCode?: string;
  iban?: string;
}

@Injectable()
export class PayoutMethodService {
  private readonly logger = new Logger(PayoutMethodService.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
  ) {}

  async create(
    userId: number,
    dto: CreatePayoutMethodDto,
  ): Promise<PayoutMethodResponse> {
    // Validate that at least one payment identifier is provided
    if (!dto.accountNumber && !dto.iban) {
      throw new BadRequestException(
        'Either accountNumber or iban must be provided',
      );
    }

    // If setting as default, unset other defaults
    if (dto.isDefault) {
      await this.prisma.payoutMethod.updateMany({
        where: { userId, isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
    }

    // Extract last 4 digits for display (from account number or IBAN)
    const lastFourDigits = this.extractLastFourDigits(
      dto.accountNumber || dto.iban || '',
    );

    // Encrypt sensitive fields
    const encryptedData = {
      encryptedAccountNumber: dto.accountNumber
        ? this.encryptionService.encrypt(dto.accountNumber)
        : null,
      encryptedRoutingNumber: dto.routingNumber
        ? this.encryptionService.encrypt(dto.routingNumber)
        : null,
      encryptedSwiftCode: dto.swiftCode
        ? this.encryptionService.encrypt(dto.swiftCode)
        : null,
      encryptedIban: dto.iban
        ? this.encryptionService.encrypt(dto.iban)
        : null,
    };

    const payoutMethod = await this.prisma.payoutMethod.create({
      data: {
        userId,
        type: dto.type,
        isDefault: dto.isDefault ?? false,
        ...encryptedData,
        bankName: dto.bankName,
        accountHolderName: dto.accountHolderName,
        country: dto.country,
        currency: dto.currency ?? 'USD',
        lastFourDigits,
      },
    });

    this.logger.log(
      `Created payout method ${payoutMethod.id} for user ${userId}`,
    );

    return this.sanitizePayoutMethod(payoutMethod);
  }

  async findAll(userId: number): Promise<PayoutMethodResponse[]> {
    const methods = await this.prisma.payoutMethod.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return methods.map((method) => this.sanitizePayoutMethod(method));
  }

  async findOne(
    id: number,
    userId: number,
  ): Promise<PayoutMethodResponse> {
    const method = await this.prisma.payoutMethod.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!method) {
      throw new NotFoundException('Payout method not found');
    }

    return this.sanitizePayoutMethod(method);
  }

  async findOneWithSensitiveData(
    id: number,
    userId: number,
  ): Promise<PayoutMethodWithSensitiveData> {
    const method = await this.prisma.payoutMethod.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!method) {
      throw new NotFoundException('Payout method not found');
    }

    return this.decryptPayoutMethod(method);
  }

  async update(
    id: number,
    userId: number,
    dto: UpdatePayoutMethodDto,
  ): Promise<PayoutMethodResponse> {
    const existing = await this.prisma.payoutMethod.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Payout method not found');
    }

    // If setting as default, unset other defaults
    if (dto.isDefault) {
      await this.prisma.payoutMethod.updateMany({
        where: { userId, isDefault: true, deletedAt: null, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.payoutMethod.update({
      where: { id },
      data: {
        bankName: dto.bankName ?? existing.bankName,
        accountHolderName: dto.accountHolderName ?? existing.accountHolderName,
        country: dto.country ?? existing.country,
        isDefault: dto.isDefault ?? existing.isDefault,
      },
    });

    this.logger.log(`Updated payout method ${id} for user ${userId}`);

    return this.sanitizePayoutMethod(updated);
  }

  async remove(id: number, userId: number): Promise<{ message: string }> {
    const method = await this.prisma.payoutMethod.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!method) {
      throw new NotFoundException('Payout method not found');
    }

    // Soft delete
    await this.prisma.payoutMethod.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Soft-deleted payout method ${id} for user ${userId}`);

    return { message: 'Payout method deleted successfully' };
  }

  async getDefaultMethod(userId: number): Promise<PayoutMethodResponse | null> {
    const method = await this.prisma.payoutMethod.findFirst({
      where: { userId, isDefault: true, deletedAt: null },
    });

    return method ? this.sanitizePayoutMethod(method) : null;
  }

  /**
   * Sanitize payout method by removing encrypted fields
   */
  private sanitizePayoutMethod(method: any): PayoutMethodResponse {
    return {
      id: method.id,
      type: method.type,
      isDefault: method.isDefault,
      bankName: method.bankName,
      accountHolderName: method.accountHolderName,
      country: method.country,
      currency: method.currency,
      lastFourDigits: method.lastFourDigits,
      createdAt: method.createdAt,
      updatedAt: method.updatedAt,
    };
  }

  /**
   * Decrypt sensitive fields for internal use
   */
  private decryptPayoutMethod(method: any): PayoutMethodWithSensitiveData {
    const sanitized = this.sanitizePayoutMethod(method);

    return {
      ...sanitized,
      accountNumber: method.encryptedAccountNumber
        ? this.encryptionService.decrypt(method.encryptedAccountNumber)
        : undefined,
      routingNumber: method.encryptedRoutingNumber
        ? this.encryptionService.decrypt(method.encryptedRoutingNumber)
        : undefined,
      swiftCode: method.encryptedSwiftCode
        ? this.encryptionService.decrypt(method.encryptedSwiftCode)
        : undefined,
      iban: method.encryptedIban
        ? this.encryptionService.decrypt(method.encryptedIban)
        : undefined,
    };
  }

  /**
   * Extract last 4 digits for display purposes
   */
  private extractLastFourDigits(value: string): string {
    const cleaned = value.replace(/\s/g, '');
    return cleaned.length >= 4 ? cleaned.slice(-4) : cleaned;
  }
}
