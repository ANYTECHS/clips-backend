import { Test, TestingModule } from '@nestjs/testing';
import { GoogleStrategy } from './google.strategy';
import { AuthService } from '../auth.service';

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;
  let authService: AuthService;

  const mockAuthService = {
    findOrCreateGoogleUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleStrategy,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    strategy = module.get<GoogleStrategy>(GoogleStrategy);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('extracts profile info and delegates to authService.findOrCreateGoogleUser', async () => {
      const mockProfile: any = {
        id: 'google-oauth-id-123',
        displayName: 'Jane Doe',
        emails: [{ value: 'jane.doe@example.com', verified: true }],
        photos: [{ value: 'https://example.com/avatar.jpg' }],
      };

      const mockUser = {
        id: 1,
        email: 'jane.doe@example.com',
        provider: 'google',
        providerId: 'google-oauth-id-123',
      };

      mockAuthService.findOrCreateGoogleUser.mockResolvedValue(mockUser);

      const result = await strategy.validate(
        'mock-access-token',
        'mock-refresh-token',
        mockProfile,
      );

      expect(authService.findOrCreateGoogleUser).toHaveBeenCalledWith({
        provider: 'google',
        providerId: 'google-oauth-id-123',
        email: 'jane.doe@example.com',
        name: 'Jane Doe',
        picture: 'https://example.com/avatar.jpg',
      });
      expect(result).toEqual(mockUser);
    });

    it('handles missing emails and photos gracefully in OAuth profile', async () => {
      const mockProfile: any = {
        id: 'google-oauth-id-456',
        displayName: 'No Email User',
      };

      const mockUser = {
        id: 2,
        email: 'google_google-oauth-id-456@no-email.google',
        provider: 'google',
        providerId: 'google-oauth-id-456',
      };

      mockAuthService.findOrCreateGoogleUser.mockResolvedValue(mockUser);

      const result = await strategy.validate(
        'mock-access-token',
        'mock-refresh-token',
        mockProfile,
      );

      expect(authService.findOrCreateGoogleUser).toHaveBeenCalledWith({
        provider: 'google',
        providerId: 'google-oauth-id-456',
        email: null,
        name: 'No Email User',
        picture: null,
      });
      expect(result).toEqual(mockUser);
    });
  });
});
