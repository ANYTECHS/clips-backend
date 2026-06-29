import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletsService } from './wallets.service';
import { WalletValidationService } from './wallet-validation.service';
import { WalletManagementService } from './wallet-management.service';
import { WalletBalanceService } from './wallet-balance.service';
import { WalletsController } from './wallets.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [AuthModule, PrismaModule, StellarModule],
  providers: [
    WalletValidationService,
    WalletManagementService,
    WalletBalanceService,
    WalletsService,
  ],
  controllers: [WalletsController],
  exports: [WalletValidationService, WalletManagementService, WalletBalanceService, WalletsService],
})
export class WalletsModule {}
