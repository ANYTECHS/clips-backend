// Minimal mock so Jest can resolve @prisma/client without a real DB connection.
export const PrismaClient = jest.fn().mockImplementation(() => ({}));

export class PrismaClientKnownRequestError extends Error {
  code: string;
  constructor(message: string, options?: { code?: string }) {
    super(message);
    this.code = options?.code ?? 'P2002';
  }
}

export const Prisma = {
  PrismaClientKnownRequestError,
};

export enum PostStatus {
  pending = 'pending',
  posted = 'posted',
  failed = 'failed',
}
