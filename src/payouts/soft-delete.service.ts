import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service for managing soft delete operations on financial records.
 * Provides utilities to safely soft-delete payouts and retrieve deleted records
 * for audit purposes.
 */
@Injectable()
export class SoftDeleteService {
  constructor(private prisma: PrismaService) {}

  /**
   * Soft delete a payout by setting its deletedAt timestamp
   * @param payoutId The ID of the payout to soft delete
   * @returns The soft-deleted payout record
   */
  async softDeletePayout(payoutId: number) {
    return this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  /**
   * Soft delete multiple payouts
   * @param payoutIds Array of payout IDs to soft delete
   * @returns Number of records deleted
   */
  async softDeletePayouts(payoutIds: number[]) {
    const result = await this.prisma.payout.updateMany({
      where: {
        id: { in: payoutIds },
      },
      data: {
        deletedAt: new Date(),
      },
    });
    return result.count;
  }

  /**
   * Restore a soft-deleted payout
   * @param payoutId The ID of the payout to restore
   * @returns The restored payout record
   */
  async restorePayout(payoutId: number) {
    return this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        deletedAt: null,
      },
    });
  }

  /**
   * Get a soft-deleted payout (admin/audit only)
   * @param payoutId The ID of the payout
   * @returns The payout record including if it's soft-deleted
   */
  async getPayoutIncludingDeleted(payoutId: number) {
    return this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
  }

  /**
   * Get all soft-deleted payouts for a user (audit query)
   * @param userId The user ID
   * @returns Array of soft-deleted payout records
   */
  async getDeletedPayoutsForUser(userId: number) {
    return this.prisma.payout.findMany({
      where: {
        userId,
        deletedAt: { not: null },
      },
      orderBy: { deletedAt: 'desc' },
    });
  }

  /**
   * Get all payouts for a user, excluding deleted ones (normal query)
   * @param userId The user ID
   * @returns Array of active payout records
   */
  async getActivePayoutsForUser(userId: number) {
    return this.prisma.payout.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Soft delete a payout method
   * @param methodId The ID of the payout method to soft delete
   * @returns The soft-deleted payout method record
   */
  async softDeletePayoutMethod(methodId: number) {
    return this.prisma.payoutMethod.update({
      where: { id: methodId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  /**
   * Restore a soft-deleted payout method
   * @param methodId The ID of the payout method to restore
   * @returns The restored payout method record
   */
  async restorePayoutMethod(methodId: number) {
    return this.prisma.payoutMethod.update({
      where: { id: methodId },
      data: {
        deletedAt: null,
      },
    });
  }

  /**
   * Get all active payout methods for a user (normal query)
   * @param userId The user ID
   * @returns Array of active payout method records
   */
  async getActivePayoutMethodsForUser(userId: number) {
    return this.prisma.payoutMethod.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all soft-deleted payout methods for a user (audit query)
   * @param userId The user ID
   * @returns Array of soft-deleted payout method records
   */
  async getDeletedPayoutMethodsForUser(userId: number) {
    return this.prisma.payoutMethod.findMany({
      where: {
        userId,
        deletedAt: { not: null },
      },
      orderBy: { deletedAt: 'desc' },
    });
  }

  /**
   * Permanently delete a soft-deleted payout (irreversible - use with caution)
   * @param payoutId The ID of the payout to permanently delete
   * @returns The deleted payout record
   */
  async permanentlyDeletePayout(payoutId: number) {
    return this.prisma.payout.delete({
      where: { id: payoutId },
    });
  }

  /**
   * Permanently delete multiple soft-deleted payouts (irreversible - use with caution)
   * @param payoutIds Array of payout IDs to permanently delete
   * @returns Number of records permanently deleted
   */
  async permanentlyDeletePayouts(payoutIds: number[]) {
    const result = await this.prisma.payout.deleteMany({
      where: {
        id: { in: payoutIds },
      },
    });
    return result.count;
  }
}
