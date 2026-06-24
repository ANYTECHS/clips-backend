import { Injectable, BadRequestException } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';

@Injectable()
export class WalletValidationService {
  constructor(private readonly stellarService: StellarService) {}

  validateStellarAddress(address: string): void {
    const validation = this.stellarService.validateAddress(address);
    if (!validation.valid) {
      throw new BadRequestException('Invalid Stellar address format');
    }
  }
}
