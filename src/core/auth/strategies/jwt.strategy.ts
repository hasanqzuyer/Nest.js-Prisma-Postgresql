import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import securityConfig from '../../../config/security.config';
import { UsersService } from '../../../core/users/users.service';
import { IJWTPayload } from '../interfaces/jwt-payload.interface';
import { UserRole } from 'src/utils';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  // ! keep as static so it can be accessed from cookieJwtExtractor function
  private static config: ConfigType<typeof securityConfig>;

  constructor(
    private usersService: UsersService,
    @Inject(securityConfig.KEY)
    private readonly config: ConfigType<typeof securityConfig>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        JwtStrategy.cookieJwtExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: "3ad1f08174d3b7036e8e13e8c87142d60823a522bbae22ab470d490f20327cc2e86cad51bce65f1489cb9d6968c33a26",
    });

    JwtStrategy.config = config;
  }

  private static cookieJwtExtractor(req: Request): string {
    return req.cookies?.[JwtStrategy.config.jwt.cookieName] || null;
  }

  async validate(payload: IJWTPayload) {
    const user = await this.usersService.findOneById(payload.user.id, true, {
      influencer: payload.user.role === UserRole.Influencer,
      client: payload.user.role === UserRole.Client,
      ambassador: payload.user.role === UserRole.Ambassador,
    });

    return user;
  }
}
