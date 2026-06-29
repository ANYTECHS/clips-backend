import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { TransactionsService } from '../src/transactions/transactions.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StellarService } from '../src/stellar/stellar.service';
import { EncryptionService } from '../src/encryption/encryption.service';

jest.mock('../src/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

// We mock the entire Stellar SDK so no real network calls happen
jest.mock('@stellar/stellar-sdk', () => {
  const mockSign = jest.fn();
  const mockBuild = jest.fn().mockReturnValue({ sign: mockSign });
  const mockTimeout = jest.fn().mockReturnValue({ build: mockBuild });
  const mockAddOperation = jest.fn().mockReturnValue({ setTimeout: mockTimeout });
  const mockTxBuilder = jest.fn().mockImplementation(() => ({
    addOperation: mockAddOperation,
  }));

  return {
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: jest.fn().mockReturnValue('GPUBLICKEY'),
      }),
    },
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn().mockResolvedValue({ id: 'GPUBLICKEY' }),
        submitTransaction: jest.fn().mockResolvedValue({ hash: 'mock-tx-hash' }),
      })),
    },
    TransactionBuilder: mockTxBuilder,
    Operation: {
      payment: jest.fn().mockReturnValue({ type: 'payment' }),
    },
    Asset: {
      native: jest.fn().mockReturnValue({ isNative: () => true }),
    },
    BASE_FEE: '100',
  };
});

const VALID_DESTINATION = 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3';

class InMemoryPrisma {
  private users: any[] = [];

  user = {
    findUnique: jest.fn(async ({ where }) => {
      return this.users.find((u) => u.id === where.id) ?? null;
    }),
  };

  _seedUser(user: any) {
    this.users.push(user);
  }
}

describe('Transactions integration', () => {
  let service: TransactionsService;
  let prisma: InMemoryPrisma;
  let stellarService: { validateAddress: jest.Mock; horizonUrl: string; networkPassphrase: string };
  let encryptionService: { decrypt: jest.Mock };

  beforeEach(async () => {
    prisma = new InMemoryPrisma();

    stellarService = {
      validateAddress: jest.fn().mockReturnValue({ valid: true }),
      horizonUrl: 'https://horizon-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    };

    encryptionService = {
      decrypt: jest.fn().mockReturnValue('SCZANGBA5YELWTYPPRHG5PJRJHQ7VVTL6IIYLXN5YB7SFT2UVNO3XHZ'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StellarService, useValue: stellarService },
        { provide: EncryptionService, useValue: encryptionService },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  // ─── send ─────────────────────────────────────────────────────────────────

  describe('send', () => {
    it('returns hash, destination, and amount on a successful send', async () => {
      prisma._seedUser({
        id: 1,
        stellarPublicKey: 'GPUBLICKEY',
        encryptedStellarSecret: 'encrypted-secret',
      });

      const result = await service.send(1, {
        destination: VALID_DESTINATION,
        amount: '10.5',
      });

      expect(result.hash).toBe('mock-tx-hash');
      expect(result.destination).toBe(VALID_DESTINATION);
      expect(result.amount).toBe('10.5');
    });

    it('throws BadRequestException for an invalid destination address', async () => {
      stellarService.validateAddress.mockReturnValue({ valid: false });
      prisma._seedUser({
        id: 1,
        stellarPublicKey: 'GPUBLICKEY',
        encryptedStellarSecret: 'encrypted-secret',
      });

      await expect(
        service.send(1, { destination: 'bad-address', amount: '5' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when user has no custodial wallet (no public key)', async () => {
      prisma._seedUser({ id: 2, stellarPublicKey: null, encryptedStellarSecret: null });

      await expect(
        service.send(2, { destination: VALID_DESTINATION, amount: '1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when user record does not exist', async () => {
      await expect(
        service.send(999, { destination: VALID_DESTINATION, amount: '1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('decrypts the stored secret before signing', async () => {
      prisma._seedUser({
        id: 3,
        stellarPublicKey: 'GPUBLICKEY',
        encryptedStellarSecret: 'some-encrypted-blob',
      });

      await service.send(3, { destination: VALID_DESTINATION, amount: '2' });

      expect(encryptionService.decrypt).toHaveBeenCalledWith('some-encrypted-blob');
    });

    it('throws InternalServerErrorException when Stellar submission fails', async () => {
      prisma._seedUser({
        id: 4,
        stellarPublicKey: 'GPUBLICKEY',
        encryptedStellarSecret: 'encrypted-secret',
      });

      // Make the Stellar SDK mock throw during submission
      const { Horizon } = jest.requireMock('@stellar/stellar-sdk');
      Horizon.Server.mockImplementationOnce(() => ({
        loadAccount: jest.fn().mockResolvedValue({ id: 'GPUBLICKEY' }),
        submitTransaction: jest.fn().mockRejectedValue(new Error('Network error')),
      }));

      await expect(
        service.send(4, { destination: VALID_DESTINATION, amount: '3' }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('throws InternalServerErrorException when Horizon loadAccount fails', async () => {
      prisma._seedUser({
        id: 5,
        stellarPublicKey: 'GPUBLICKEY',
        encryptedStellarSecret: 'encrypted-secret',
      });

      const { Horizon } = jest.requireMock('@stellar/stellar-sdk');
      Horizon.Server.mockImplementationOnce(() => ({
        loadAccount: jest.fn().mockRejectedValue(new Error('Account not found on ledger')),
        submitTransaction: jest.fn(),
      }));

      await expect(
        service.send(5, { destination: VALID_DESTINATION, amount: '5' }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
