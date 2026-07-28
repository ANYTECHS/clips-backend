import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    this.$use(async (params, next) => {
      const result = await next(params);
      
      try {
        const createAuditLog = async (userId: number, amount: number, actionType: string) => {
          await this.earningsAuditLog.create({
            data: { userId, amount, actionType },
          });
        };

        const processRecord = async (record: any, model: string, action: string) => {
          if (!record) return;
          if (model === 'Payout' && record.userId && record.amount !== undefined) {
            const statusStr = record.status ? `_${record.status}` : '';
            await createAuditLog(
              record.userId, 
              record.amount, 
              `payout_action_${action}${statusStr}`
            );
          }
          if (model === 'Earning' && record.clipId && record.amount !== undefined) {
            const clip = await this.clip.findUnique({
              where: { id: record.clipId },
              include: { video: { select: { userId: true } } }
            });
            if (clip?.video?.userId) {
              const type = record.deletedAt ? 'delete' : action;
              await createAuditLog(
                clip.video.userId, 
                record.amount, 
                `earning_adjustment_${type}`
              );
            }
          }
        };

        const targetModels = ['Payout', 'Earning'];
        const targetActions = ['create', 'update', 'upsert', 'delete'];
        
        if (params.model && targetModels.includes(params.model) && params.action && targetActions.includes(params.action)) {
          if (Array.isArray(result)) {
            for (const item of result) {
              await processRecord(item, params.model, params.action);
            }
          } else {
            await processRecord(result, params.model, params.action);
          }
        }
      } catch (err) {
        // fail silently to avoid breaking the main transaction
        console.error('Failed to create audit log:', err);
      }

      return result;
    });

    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Run multiple operations in a single database transaction.
   * All operations succeed or all are rolled back.
   *
   * @example
   * await this.prisma.withTransaction(async (tx) => {
   *   const earning = await tx.earning.create({ data: { ... } });
   *   await tx.payout.update({ where: { id }, data: { status: 'completed' } });
   *   return earning;
   * });
   */
  async withTransaction<T>(
    fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(fn);
  }

  /**
   * Run a batch of independent Prisma operations in a single transaction.
   * Useful when you have a fixed list of queries to execute atomically.
   *
   * @example
   * const [payout, earning] = await this.prisma.withBatch([
   *   this.prisma.payout.create({ data: { ... } }),
   *   this.prisma.earning.update({ where: { id }, data: { ... } }),
   * ]);
   */
  async withBatch<T extends readonly object[]>(
    queries: readonly [...{ [K in keyof T]: Promise<T[K]> }],
  ): Promise<T> {
    return this.$transaction(queries) as Promise<T>;
  }
}
