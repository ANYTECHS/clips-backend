import { NotificationsService } from './notifications.service';

function makeService() {
  const store = new Map<string, any>();
  let seq = 1;
  const prisma = {
    notification: {
      findUnique: jest.fn(async ({ where }: any) =>
        store.get(`${where.jobId_type.jobId}:${where.jobId_type.type}`) ?? null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: seq++, readAt: null, createdAt: new Date(), ...data };
        store.set(`${data.jobId}:${data.type}`, row);
        return row;
      }),
      findMany: jest.fn(async () => [...store.values()]),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: {
      findUnique: jest.fn(async () => ({ email: 'user@example.com' })),
    },
  };
  const emitted: Array<{ userId: number; payload: any }> = [];
  const gateway = {
    emitNotification: jest.fn((userId: number, payload: any) => {
      emitted.push({ userId, payload });
    }),
  };
  const enqueued: any[] = [];
  const email = {
    enqueue: jest.fn(async (data: any) => {
      enqueued.push(data);
    }),
  };
  const service = new NotificationsService(
    prisma as any,
    gateway as any,
    email as any,
  );
  return { service, store, emitted, enqueued, email };
}

const input = {
  jobId: 'job-1',
  type: 'clip-generation',
  userId: 7,
  title: 'Your clips are ready',
  body: 'Video processing finished',
  link: '/videos/9',
};

describe('NotificationsService (#917)', () => {
  it('creates in-app notification, emits WS event and enqueues email with clip link', async () => {
    const { service, emitted, enqueued } = makeService();
    const { notification, duplicate } = await service.notifyJobCompleted(input);
    expect(duplicate).toBe(false);
    expect(notification.jobId).toBe('job-1');

    expect(emitted).toHaveLength(1);
    expect(emitted[0].userId).toBe(7);
    expect(emitted[0].payload.link).toBe('/videos/9');

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].to).toBe('user@example.com');
    expect(enqueued[0].template).toBe('job-completed');
    expect(enqueued[0].context.link).toBe('/videos/9');
  });

  it('suppresses duplicate notifications for the same job', async () => {
    const { service, emitted, enqueued } = makeService();
    await service.notifyJobCompleted(input);
    const second = await service.notifyJobCompleted(input);
    expect(second.duplicate).toBe(true);
    expect(emitted).toHaveLength(1);
    expect(enqueued).toHaveLength(1);
  });

  it('still lands in-app + WS when email fails', async () => {
    const { service, emitted, enqueued, email } = makeService();
    email.enqueue.mockRejectedValueOnce(new Error('smtp down'));
    const { notification, duplicate } = await service.notifyJobCompleted(input);
    expect(duplicate).toBe(false);
    expect(notification.jobId).toBe('job-1');
    expect(emitted).toHaveLength(1);
    expect(enqueued).toHaveLength(0);
  });

  it('lists and marks read', async () => {
    const { service } = makeService();
    await service.notifyJobCompleted(input);
    const list = await service.listForUser(7, {});
    expect(list).toHaveLength(1);
    await service.markRead(7, list[0].id);
  });
});
