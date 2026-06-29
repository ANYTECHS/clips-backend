import { AppLoggerService } from './logger.service';

describe('AppLoggerService', () => {
  let service: AppLoggerService;
  let stdoutSpy: jest.SpyInstance;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'debug';
    service = new AppLoggerService();
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.LOG_LEVEL;
  });

  it('outputs JSON in production', () => {
    service.log('hello world', 'TestCtx');
    expect(stdoutSpy).toHaveBeenCalled();
    const raw = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('hello world');
    expect(parsed.context).toBe('TestCtx');
    expect(parsed.timestamp).toBeDefined();
  });

  it('redacts sensitive fields', () => {
    service.log('user login', { password: 'secret123', email: 'user@example.com' });
    const raw = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.password).toBe('[REDACTED]');
    expect(parsed.email).toBe('user@example.com');
  });

  it('redacts token fields', () => {
    service.log('token issued', { accessToken: 'abc.def.ghi', userId: 1 });
    const raw = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.accessToken).toBe('[REDACTED]');
    expect(parsed.userId).toBe(1);
  });

  it('includes requestId when provided', () => {
    service.log('request handled', { requestId: 'req-uuid-123' });
    const raw = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.requestId).toBe('req-uuid-123');
  });

  it('respects LOG_LEVEL — suppresses debug when level is warn', () => {
    process.env.LOG_LEVEL = 'warn';
    service = new AppLoggerService();
    service.debug('should not appear');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});
