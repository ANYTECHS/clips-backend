import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;
  let configService: ConfigService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue('test-encryption-secret-32-chars-long'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt', () => {
    it('should encrypt a string', () => {
      const plaintext = 'sensitive-access-token';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64 pattern
    });

    it('should return empty string for empty input', () => {
      const encrypted = service.encrypt('');
      expect(encrypted).toBe('');
    });

    it('should return null for null input', () => {
      const encrypted = service.encrypt(null as any);
      expect(encrypted).toBeNull();
    });

    it('should produce different encrypted values for same input', () => {
      const plaintext = 'same-input';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2); // Different IV should produce different ciphertext
    });
  });

  describe('decrypt', () => {
    it('should decrypt an encrypted string', () => {
      const plaintext = 'sensitive-access-token';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should return empty string for empty input', () => {
      const decrypted = service.decrypt('');
      expect(decrypted).toBe('');
    });

    it('should return null for null input', () => {
      const decrypted = service.decrypt(null as any);
      expect(decrypted).toBeNull();
    });

    it('should throw error for invalid encrypted data', () => {
      expect(() => service.decrypt('invalid-base64')).toThrow('Failed to decrypt sensitive data');
    });

    it('should throw error when decrypting with a different key', () => {
      const plaintext = 'sensitive-access-token';
      const encrypted = service.encrypt(plaintext);
      const wrongConfigService = { get: jest.fn().mockReturnValue('different-test-encryption-secret') };
      const wrongService = new EncryptionService(wrongConfigService as any);

      expect(() => wrongService.decrypt(encrypted)).toThrow('Failed to decrypt sensitive data');
    });
  });

  describe('constructor', () => {
    it('should throw if ENCRYPTION_SECRET is missing', async () => {
      const mockConfigService = {
        get: jest.fn().mockReturnValue(undefined),
      };

      await expect(
        Test.createTestingModule({
          providers: [
            EncryptionService,
            {
              provide: ConfigService,
              useValue: mockConfigService,
            },
          ],
        }).compile(),
      ).rejects.toThrow('ENCRYPTION_SECRET environment variable is required');
    });
  });

  describe('encryptObjectFields', () => {
    it('should encrypt specified fields in an object', () => {
      const obj = {
        id: 1,
        accessToken: 'secret-token',
        refreshToken: 'refresh-secret',
        username: 'user123',
      };

      const encrypted = service.encryptObjectFields(obj, ['accessToken', 'refreshToken']);

      expect(encrypted.id).toBe(1);
      expect(encrypted.username).toBe('user123');
      expect(encrypted.accessToken).not.toBe('secret-token');
      expect(encrypted.refreshToken).not.toBe('refresh-secret');
      expect(encrypted.accessToken).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(encrypted.refreshToken).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('should not encrypt fields that are not strings', () => {
      const obj = {
        id: 1,
        accessToken: null,
        refreshToken: undefined,
      };

      const encrypted = service.encryptObjectFields(obj, ['accessToken', 'refreshToken']);

      expect(encrypted.id).toBe(1);
      expect(encrypted.accessToken).toBeNull();
      expect(encrypted.refreshToken).toBeUndefined();
    });
  });

  describe('decryptObjectFields', () => {
    it('should decrypt specified fields in an object', () => {
      const obj = {
        id: 1,
        accessToken: 'secret-token',
        refreshToken: 'refresh-secret',
        username: 'user123',
      };

      const encrypted = service.encryptObjectFields(obj, ['accessToken', 'refreshToken']);
      const decrypted = service.decryptObjectFields(encrypted, ['accessToken', 'refreshToken']);

      expect(decrypted.id).toBe(1);
      expect(decrypted.username).toBe('user123');
      expect(decrypted.accessToken).toBe('secret-token');
      expect(decrypted.refreshToken).toBe('refresh-secret');
    });

    it('should handle decryption failures gracefully', () => {
      const obj = {
        id: 1,
        accessToken: 'invalid-encrypted-data',
        username: 'user123',
      };

      const decrypted = service.decryptObjectFields(obj, ['accessToken']);

      expect(decrypted.id).toBe(1);
      expect(decrypted.username).toBe('user123');
      expect(decrypted.accessToken).toBe('invalid-encrypted-data'); // Should remain unchanged
    });
  });

  describe('round trip', () => {
    it('should handle complex objects correctly', () => {
      const original = {
        id: 123,
        platform: 'twitter',
        username: 'testuser',
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        connectedAt: new Date(),
      };

      const encrypted = service.encryptObjectFields(original, ['accessToken', 'refreshToken']);
      const decrypted = service.decryptObjectFields(encrypted, ['accessToken', 'refreshToken']);

      expect(decrypted).toEqual(original);
    });
  });
});
