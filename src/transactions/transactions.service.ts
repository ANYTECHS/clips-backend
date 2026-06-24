import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { EncryptionService } from '../encryption/encryption.service';
import * as StellarSdk from '@stellar/stellar-sdk';

interface SendTransactionDto {
  destination: string;
  amount: string;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly encryption: EncryptionService,
  ) {}

  async send(userId: number, dto: SendTransactionDto) {
    const check = this.stellar.validateAddress(dto.destination);
    if (!check.valid) {
      throw new BadRequestException('Invalid destination address');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.stellarPublicKey || !user.encryptedStellarSecret) {
      throw new NotFoundException('User has no custodial wallet');
    }

    const secret = this.encryption.decrypt(user.encryptedStellarSecret);

    try {
      const keypair = StellarSdk.Keypair.fromSecret(secret);
      const server = new StellarSdk.Horizon.Server(this.stellar.horizonUrl);
      const account = await server.loadAccount(keypair.publicKey());

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.stellar.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: dto.destination,
            asset: StellarSdk.Asset.native(),
            amount: dto.amount,
          }),
        )
        .setTimeout(180)
        .build();

      tx.sign(keypair);
      const result = await server.submitTransaction(tx);

      return {
        hash: (result as any).hash,
        destination: dto.destination,
        amount: dto.amount,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) throw error;

      const message = error instanceof Error ? error.message : 'Transaction failed';
      throw new InternalServerErrorException(message);
    }
  }
}
