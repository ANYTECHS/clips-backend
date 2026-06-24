import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfigService } from '../../config/app-config.service';

export type JwtPayload = {
  sub: number;
  email: string | null;
  emailVerified?: boolean;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(appConfig: AppConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: appConfig.jwtSecret,
    });
  }

  validate(payload: JwtPayload) {
    if (!payload?.sub) throw new UnauthorizedException();
    if (payload.emailVerified === false) {
      throw new UnauthorizedException(
        'Please verify your email to access this feature',
      );
    }
    return {
      id: payload.sub,
      email: payload.email,
      emailVerified: payload.emailVerified,
    };
  }
}
