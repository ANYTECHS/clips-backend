import { Injectable, ConflictException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { maskAddress } from '@clipcash/shared';
import { UsernameAvailabilityService } from './username-availability.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly usernames: UsernameAvailabilityService,
  ) {}

  /** Set/update the user's username; unchanged usernames are allowed, duplicates return 409. */
  async updateUsername(userId: number, username: string) {
    const value = this.usernames.normalize(username);
    return this.usernames.withUniqueUsername(
      value,
      () =>
        this.prisma.user.update({
          where: { id: userId },
          data: { username: value },
          select: { id: true, username: true },
        }),
      userId,
    );
  }

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

    return { stellarPublicKey: maskAddress(publicKey), walletType: 'custodial' };
  }

  /** Return the current user's profile including a masked Stellar public key. */
  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        picture: true,
        emailVerified: true,
        stellarPublicKey: true,
        walletType: true,
        showOnLeaderboard: true,
        createdAt: true,
      },
    });

    if (!user) {
      return user;
    }

    return {
      ...user,
      stellarPublicKey: user.stellarPublicKey
        ? maskAddress(user.stellarPublicKey)
        : user.stellarPublicKey,
    };
  }
}
