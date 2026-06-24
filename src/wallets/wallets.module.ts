import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletsService } from './wallets.service';
import { WalletValidationService } from './wallet-validation.service';
import { WalletManagementService } from './wallet-management.service';
import { WalletsController } from './wallets.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [AuthModule, PrismaModule, StellarModule],
  providers: [
    WalletValidationService,
    WalletManagementService,
    WalletsService,
  ],
  controllers: [WalletsController],
  exports: [WalletValidationService, WalletManagementService, WalletsService],
})
export class WalletsModule {}
