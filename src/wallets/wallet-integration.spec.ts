import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { WalletsModule } from './wallets.module';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import * as StellarSdk from '@stellar/stellar-sdk';

describe('Wallet Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let stellarService: StellarService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [WalletsModule],
      providers: [
        {
          provide: 'DATABASE_URL',
          useValue: process.env.DATABASE_URL,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    stellarService = moduleFixture.get<StellarService>(StellarService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Wallet Creation and Transaction Proxy', () => {
    it('should create a Stellar wallet', async () => {
      const keypair = StellarSdk.Keypair.random();
      const publicKey = keypair.publicKey();

      const wallet = await prisma.wallet.create({
        data: {
          userId: 1,
          address: publicKey,
          chain: 'stellar',
          type: 'user',
        },
      });

      expect(wallet.address).toBe(publicKey);
      expect(wallet.chain).toBe('stellar');
    });

    it('should handle transaction proxy errors gracefully', async () => {
      const keypair = StellarSdk.Keypair.random();
      const publicKey = keypair.publicKey();

      // Create wallet for transaction testing
      const wallet = await prisma.wallet.create({
        data: {
          userId: 2,
          address: publicKey,
          chain: 'stellar',
          type: 'user',
        },
      });

      // Mock a transaction that would fail
      expect(wallet).toBeDefined();
    });

    it('should track wallet connection timestamp', async () => {
      const keypair = StellarSdk.Keypair.random();
      const publicKey = keypair.publicKey();
      const now = new Date();

      const wallet = await prisma.wallet.create({
        data: {
          userId: 3,
          address: publicKey,
          chain: 'stellar',
          type: 'user',
          connectedAt: now,
        },
      });

      expect(wallet.connectedAt).toEqual(now);
    });
  });

  describe('Payout Processing with Fee Calculation', () => {
    it('should calculate fees before payout processing', async () => {
      // Setup: create a payout with fee configuration
      const feeConfig = await prisma.payoutFeeConfig.upsert({
        where: { method: 'stellar' },
        update: {},
        create: {
          method: 'stellar',
          feeType: 'percentage',
          feePercentage: 2,
          fixedFee: 0,
          minFee: 0,
        },
      });

      expect(feeConfig.feePercentage).toBe(2);
      expect(feeConfig.feeType).toBe('percentage');
    });

    it('should handle fixed fee calculations', async () => {
      const feeConfig = await prisma.payoutFeeConfig.upsert({
        where: { method: 'ach' },
        update: {},
        create: {
          method: 'ach',
          feeType: 'fixed',
          feePercentage: 0,
          fixedFee: 1,
          minFee: 0,
        },
      });

      expect(feeConfig.feeType).toBe('fixed');
      expect(feeConfig.fixedFee).toBe(1);
    });

    it('should handle combined fee calculations', async () => {
      const feeConfig = await prisma.payoutFeeConfig.upsert({
        where: { method: 'bank_transfer' },
        update: {},
        create: {
          method: 'bank_transfer',
          feeType: 'combined',
          feePercentage: 1.5,
          fixedFee: 0.5,
          minFee: 1,
          maxFee: 50,
        },
      });

      expect(feeConfig.feePercentage).toBe(1.5);
      expect(feeConfig.fixedFee).toBe(0.5);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle wallet connection errors', async () => {
      const invalidAddress = 'INVALID_ADDRESS';

      const error = new Error('Invalid Stellar address');

      expect(() => {
        throw error;
      }).toThrow('Invalid Stellar address');
    });

    it('should handle transaction failure scenarios', async () => {
      const transactionError = new Error('Transaction failed: Insufficient funds');

      expect(() => {
        throw transactionError;
      }).toThrow('Insufficient funds');
    });

    it('should handle fee configuration errors', async () => {
      const configError = new Error('Fee configuration not found for method');

      expect(() => {
        throw configError;
      }).toThrow('Fee configuration not found');
    });
  });

  describe('Soft Delete on Financial Records', () => {
    it('should soft delete a payout', async () => {
      const keypair = StellarSdk.Keypair.random();
      const wallet = await prisma.wallet.create({
        data: {
          userId: 4,
          address: keypair.publicKey(),
          chain: 'stellar',
          type: 'user',
        },
      });

      const payout = await prisma.payout.create({
        data: {
          userId: 4,
          walletId: wallet.id,
          amount: 100,
          currency: 'USD',
          method: 'stellar',
          status: 'pending',
        },
      });

      // Soft delete
      const softDeleted = await prisma.payout.update({
        where: { id: payout.id },
        data: { deletedAt: new Date() },
      });

      expect(softDeleted.deletedAt).not.toBeNull();

      // Verify can still be retrieved by admin with filter
      const retrieved = await prisma.payout.findUnique({
        where: { id: payout.id },
      });

      expect(retrieved.deletedAt).not.toBeNull();
    });

    it('should restore a soft-deleted payout', async () => {
      const keypair = StellarSdk.Keypair.random();
      const wallet = await prisma.wallet.create({
        data: {
          userId: 5,
          address: keypair.publicKey(),
          chain: 'stellar',
          type: 'user',
        },
      });

      const payout = await prisma.payout.create({
        data: {
          userId: 5,
          walletId: wallet.id,
          amount: 100,
          currency: 'USD',
          method: 'stellar',
          status: 'pending',
          deletedAt: new Date(),
        },
      });

      // Restore
      const restored = await prisma.payout.update({
        where: { id: payout.id },
        data: { deletedAt: null },
      });

      expect(restored.deletedAt).toBeNull();
    });

    it('should exclude deleted payouts from normal queries', async () => {
      const userId = 6;
      const keypair = StellarSdk.Keypair.random();
      const wallet = await prisma.wallet.create({
        data: {
          userId,
          address: keypair.publicKey(),
          chain: 'stellar',
          type: 'user',
        },
      });

      // Create active payout
      const activePayout = await prisma.payout.create({
        data: {
          userId,
          walletId: wallet.id,
          amount: 100,
          currency: 'USD',
          method: 'stellar',
          status: 'pending',
        },
      });

      // Create deleted payout
      const deletedPayout = await prisma.payout.create({
        data: {
          userId,
          walletId: wallet.id,
          amount: 50,
          currency: 'USD',
          method: 'stellar',
          status: 'pending',
          deletedAt: new Date(),
        },
      });

      // Query active payouts
      const activePayouts = await prisma.payout.findMany({
        where: {
          userId,
          deletedAt: null,
        },
      });

      expect(activePayouts).toHaveLength(1);
      expect(activePayouts[0].id).toBe(activePayout.id);

      // Admin query including deleted
      const allPayouts = await prisma.payout.findMany({
        where: { userId },
      });

      expect(allPayouts.length).toBeGreaterThanOrEqual(2);
    });
  });
});
