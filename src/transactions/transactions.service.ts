import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Keypair,
  Horizon,
  TransactionBuilder,
  Operation,
  Asset,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { EncryptionService } from '../encryption/encryption.service';
import { RedisService } from '../redis/redis.service';
import { CreateTransactionDto, TRANSACTION_DAILY_LIMIT } from './dto/send-transaction.dto';

const DAILY_VOLUME_TTL_SEC = 86_400; // 24 h

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly encryption: EncryptionService,
    private readonly redis: RedisService,
  ) {}

  async send(
    userId: number,
    dto: CreateTransactionDto,
    idempotencyKey?: string,
  ): Promise<{ hash: string; destination: string; amount: string }> {
    // 1. Validate destination address format (belt-and-suspenders — DTO regex already checks)
    const validation = this.stellar.validateAddress(dto.destination);
    if (!validation.valid) {
      throw new BadRequestException('Invalid destination Stellar address');
    }

    // 2. Load user's custodial wallet
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stellarPublicKey: true, encryptedStellarSecret: true },
    });

    if (!user?.stellarPublicKey || !user.encryptedStellarSecret) {
      throw new NotFoundException('No custodial Stellar wallet found for this user');
    }

    // 3. Block self-sends
    if (user.stellarPublicKey === dto.destination) {
      throw new BadRequestException('Cannot send XLM to your own custodial wallet');
    }

    const amount = parseFloat(dto.amount);

    // 4. Idempotency check — return cached result for duplicate keys
    if (idempotencyKey) {
      const idempotencyRedisKey = `tx:idem:${userId}:${idempotencyKey}`;
      const cached = await this.redis.get(idempotencyRedisKey);
      if (cached) {
        this.logger.log(`Idempotency hit for user ${userId}, key=${idempotencyKey}`);
        return JSON.parse(cached) as { hash: string; destination: string; amount: string };
      }
    }

    // 5. Daily rolling volume cap (50 000 XLM per user per 24 h)
    const volumeKey = `tx:daily_volume:${userId}`;
    const currentVolumeStr = await this.redis.get(volumeKey);
    const currentVolume = currentVolumeStr ? parseFloat(currentVolumeStr) : 0;

    if (currentVolume + amount > TRANSACTION_DAILY_LIMIT) {
      throw new UnprocessableEntityException(
        `Daily transaction limit of ${TRANSACTION_DAILY_LIMIT} XLM reached. Try again in 24 hours.`,
      );
    }

    // 6. Build, sign, and submit the Stellar transaction
    const secret = this.encryption.decrypt(user.encryptedStellarSecret);
    const keypair = Keypair.fromSecret(secret);
    const server = new Horizon.Server(this.stellar.horizonUrl);

    let result: { hash: string };

    try {
      const account = await server.loadAccount(keypair.publicKey());

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.stellar.networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: dto.destination,
            asset: Asset.native(),
            amount: dto.amount,
          }),
        )
        .setTimeout(60)
        .build();

      tx.sign(keypair);

      result = await server.submitTransaction(tx);

      this.logger.log(`Transaction submitted for user ${userId}: ${result.hash}`);
    } catch (error) {
      this.logger.error(`Transaction failed for user ${userId}:`, error);
      throw new InternalServerErrorException('Failed to submit Stellar transaction');
    }

    const response = { hash: result.hash, destination: dto.destination, amount: dto.amount };

    // 7. Update daily volume counter in Redis (non-blocking — fire and forget errors)
    this.redis
      .get(volumeKey)
      .then(async (v) => {
        const newVolume = (v ? parseFloat(v) : 0) + amount;
        // Only set TTL on first write; subsequent writes just update the value
        if (!v) {
          await this.redis.setex(volumeKey, DAILY_VOLUME_TTL_SEC, String(newVolume));
        } else {
          // Preserve the existing TTL: use INCRBYFLOAT which keeps the key's TTL
          await this.redis.getClient().incrbyfloat(volumeKey, amount);
        }
      })
      .catch((err: Error) =>
        this.logger.warn(`Failed to update daily volume for user ${userId}: ${err.message}`),
      );

    // 8. Cache response under idempotency key (24 h TTL matches volume window)
    if (idempotencyKey) {
      const idempotencyRedisKey = `tx:idem:${userId}:${idempotencyKey}`;
      await this.redis.setex(idempotencyRedisKey, DAILY_VOLUME_TTL_SEC, JSON.stringify(response));
    }

    return response;
  }
}

