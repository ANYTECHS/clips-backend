import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WalletValidationService } from './wallet-validation.service';
import { StellarService } from '../stellar/stellar.service';

const mockStellarService = {
  validateAddress: jest.fn(),
};

describe('WalletValidationService', () => {
  let service: WalletValidationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletValidationService,
        { provide: StellarService, useValue: mockStellarService },
      ],
    }).compile();
    service = module.get<WalletValidationService>(WalletValidationService);
  });

  describe('validateStellarAddress', () => {
    it('throws BadRequestException when address is invalid', () => {
      mockStellarService.validateAddress.mockReturnValue({ valid: false });
      expect(() => service.validateStellarAddress('bad')).toThrow(
        BadRequestException,
      );
      expect(() => service.validateStellarAddress('bad')).toThrow(
        'Invalid Stellar address format',
      );
    });

    it('does not throw when address is valid', () => {
      mockStellarService.validateAddress.mockReturnValue({ valid: true });
      expect(() =>
        service.validateStellarAddress(
          'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        ),
      ).not.toThrow();
    });
  });

  describe('validateAddressForChain', () => {
    describe('stellar', () => {
      it('delegates to validateStellarAddress', () => {
        mockStellarService.validateAddress.mockReturnValue({ valid: true });
        expect(() =>
          service.validateAddressForChain(
            'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
            'stellar',
          ),
        ).not.toThrow();
        expect(mockStellarService.validateAddress).toHaveBeenCalledTimes(1);
      });

      it('throws when the Stellar address is invalid', () => {
        mockStellarService.validateAddress.mockReturnValue({ valid: false });
        expect(() =>
          service.validateAddressForChain('bad-address', 'stellar'),
        ).toThrow(BadRequestException);
      });
    });

    describe('solana', () => {
      it('accepts a valid base58 Solana public key (32 chars)', () => {
        expect(() =>
          service.validateAddressForChain(
            '11111111111111111111111111111112',
            'solana',
          ),
        ).not.toThrow();
      });

      it('accepts a valid base58 Solana public key (44 chars)', () => {
        expect(() =>
          service.validateAddressForChain(
            'So11111111111111111111111111111111111111112',
            'solana',
          ),
        ).not.toThrow();
      });

      it('throws BadRequestException for an invalid Solana address', () => {
        expect(() =>
          service.validateAddressForChain('not-a-valid-address', 'solana'),
        ).toThrow(BadRequestException);
      });

      it('throws for a Solana address with invalid base58 characters (0, O, I, l)', () => {
        expect(() =>
          service.validateAddressForChain(
            '0OIl1111111111111111111111111111',
            'solana',
          ),
        ).toThrow(BadRequestException);
      });

      it('does not call StellarService for a Solana address', () => {
        service.validateAddressForChain(
          'So11111111111111111111111111111111111111112',
          'solana',
        );
        expect(mockStellarService.validateAddress).not.toHaveBeenCalled();
      });
    });

    describe('base', () => {
      it('accepts a valid EVM address', () => {
        expect(() =>
          service.validateAddressForChain(
            '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            'base',
          ),
        ).not.toThrow();
      });

      it('accepts a lowercase EVM address', () => {
        expect(() =>
          service.validateAddressForChain(
            '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
            'base',
          ),
        ).not.toThrow();
      });

      it('throws BadRequestException for a missing 0x prefix', () => {
        expect(() =>
          service.validateAddressForChain(
            'd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            'base',
          ),
        ).toThrow(BadRequestException);
      });

      it('throws BadRequestException for an address that is too short', () => {
        expect(() => service.validateAddressForChain('0x1234', 'base')).toThrow(
          BadRequestException,
        );
      });

      it('throws BadRequestException for non-hex characters', () => {
        expect(() =>
          service.validateAddressForChain(
            '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA9604Z',
            'base',
          ),
        ).toThrow(BadRequestException);
      });

      it('does not call StellarService for a Base address', () => {
        service.validateAddressForChain(
          '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          'base',
        );
        expect(mockStellarService.validateAddress).not.toHaveBeenCalled();
      });
    });
  });
});
