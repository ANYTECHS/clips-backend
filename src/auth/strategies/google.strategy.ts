import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'google-client-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'google-client-secret',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:3000/auth/google/callback',
      scope: ['profile', 'email'],
      passReqToCallback: false,
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile) {
    const emails = profile.emails || [];
    const email = emails.length ? emails[0].value : null;
    const name = profile.displayName ?? null;
    const picture =
      (profile.photos && profile.photos.length && profile.photos[0].value) ||
      null;
    const user = await this.authService.findOrCreateGoogleUser({
      provider: 'google',
      providerId: profile.id,
      email,
      name,
      picture,
    });
    return user;
  }
}
