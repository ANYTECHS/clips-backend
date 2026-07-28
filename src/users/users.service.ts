import { Injectable, ConflictException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  /** Generate and persist a Stellar custodial wallet for a user. Idempotent. */
  async createWallet(userId: number): Promise<{ stellarPublicKey: string; walletType: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (user?.stellarPublicKey) {
      throw new ConflictException('Wallet already exists for this user');
    }

    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();
    const encryptedSecret = this.encryption.encrypt(keypair.secret());

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        stellarPublicKey: publicKey,
        walletType: 'custodial',
        encryptedStellarSecret: encryptedSecret,
      },
    });

    return { stellarPublicKey: publicKey, walletType: 'custodial' };
  }

  /** Return the current user's profile including Stellar public key. */
  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
        emailVerified: true,
        stellarPublicKey: true,
        walletType: true,
        createdAt: true,
      },
    });
    return user;
  }
}
