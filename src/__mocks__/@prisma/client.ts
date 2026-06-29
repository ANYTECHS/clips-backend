// Minimal mock so Jest can resolve @prisma/client without a real DB connection.
export const PrismaClient = jest.fn().mockImplementation(() => ({}));

export enum PostStatus {
  pending = 'pending',
  posted = 'posted',
  failed = 'failed',
}
