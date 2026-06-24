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
