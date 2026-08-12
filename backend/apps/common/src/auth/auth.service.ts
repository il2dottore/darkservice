import { Injectable } from '@nestjs/common';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  RuntimeException,
  UnauthorizedError,
} from '@app/common';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from './dtos/requests/login.dto';
import { JwtModuleOptions, JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { CreateUserDto } from '../user/dtos/requests/create-user.dto';
import { UpdateUserDto } from '../user/dtos/requests/update-user.dto';
import { SessionResponse } from './dtos/responses/session-response';
import { RedisService } from '@app/redis/redis.service';
import { UserService } from '../user/user.service';
import { ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';
import { MailService } from './mail.service';
import { compact } from 'lodash';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
  ) {}

  private sanitizeUser(user: User) {
    Reflect.deleteProperty(user, 'password');
    return user;
  }

  private parseUserAgent(ua: string): string {
    const u = ua.toLowerCase();
    if (u.includes('iphone')) return 'iPhone';
    if (u.includes('ipad')) return 'iPad';
    if (u.includes('android')) return 'Android';
    if (u.includes('mac')) return 'Mac';
    if (u.includes('windows')) return 'Windows PC';
    if (u.includes('linux')) return 'Linux';
    return 'Unknown device';
  }

  private getDeviceKind(deviceName: string): string {
    const d = deviceName.toLowerCase();
    if (d.includes('iphone') || d.includes('android')) return 'mobile';
    if (d.includes('ipad')) return 'tablet';
    return 'desktop';
  }

  async login(
    loginDto: LoginDto,
    deviceInfo?: { ipAddress?: string; userAgent?: string },
  ) {
    const identifier = loginDto.username.trim();
    const user = identifier.includes('@')
      ? await this.userService.findOneByEmail(identifier)
      : await this.userService.findOneByUsername(identifier);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isPasswordValid = await argon2.verify(
      user.password,
      loginDto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid password');
    }

    return this.issueSession(user, deviceInfo);
  }

  async register(createUserDto: CreateUserDto) {
    const existingUsername = await this.userService.findOneByUsername(
      createUserDto.username,
    );
    if (existingUsername) {
      throw new ConflictError('Username already exists');
    }

    const existingEmail = await this.userService.findOneByEmail(
      createUserDto.email,
    );
    if (existingEmail) {
      throw new ConflictError('Email already exists');
    }

    const user = await this.userService.create(createUserDto);
    const verificationToken = randomUUID();
    await this.redis.set(
      `email-verification:${verificationToken}`,
      user.id,
      86400,
    );
    await this.mail.sendEmailVerification(user.email, verificationToken);

    return this.login({
      username: user.username,
      password: createUserDto.password,
    });
  }

  async verifyEmail(token: string) {
    const userId = await this.redis.get(`email-verification:${token}`);
    if (!userId)
      throw new UnauthorizedError('Verification link is invalid or expired');
    await this.userService.verifyEmail(userId);
    await this.redis.del(`email-verification:${token}`);
    return { success: true };
  }

  async forgotPassword(email: string) {
    const user = await this.userService.findOneByEmail(email);
    if (user) {
      const token = randomUUID();
      await this.redis.set(`password-reset:${token}`, user.id, 900);
      await this.mail.sendPasswordReset(email, token);
    }
    return { success: true };
  }

  async resetPassword(token: string, password: string) {
    const userId = await this.redis.get(`password-reset:${token}`);
    if (!userId)
      throw new UnauthorizedError('Reset token is invalid or expired');
    await this.userService.updatePassword(userId, password);
    await this.redis.del(`password-reset:${token}`);
    return { success: true };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<{
        sub: string;
        sessionId: string;
      }>(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
      if (!payload.sub || !payload.sessionId)
        throw new UnauthorizedError('Invalid refresh token');

      const sessionKey = `session:${payload.sub}:${payload.sessionId}`;
      const sessionData = await this.redis.getJson<SessionData>(sessionKey);
      const stored = sessionData;
      if (!stored) throw new UnauthorizedError('Session has expired');

      const tokenHash = this.hashToken(refreshToken);
      if (stored.refreshTokenHash !== tokenHash) {
        throw new UnauthorizedError('Refresh token revoked or already used');
      }

      const user = await this.userService.getById(payload.sub);
      if (!user) throw new UnauthorizedError('User no longer exists');

      return this.issueSession(
        user,
        {
          ipAddress: stored.ipAddress,
          userAgent: stored.userAgent,
        },
        payload.sessionId,
        stored,
      );
    } catch (error) {
      if (error instanceof RuntimeException) throw error;
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }

  async getProfile(userId: string) {
    const details = await this.userService.getUserDetailsById(userId);
    const google = await this.userService.getGoogleAccount(userId);
    return {
      ...details.user,
      googleId: google?.providerAccountId ?? null,
      googleEmail: google?.email ?? null,
      roles: details.roles,
      permissions: details.roles_permissions.map(
        ({ permission_id }) => permission_id,
      ),
      plans: details.plans.map(({ plan_features, ...plan }) => ({
        ...plan,
        planFeatures: plan_features.map(({ id, name }) => ({ id, name })),
      })),
    };
  }

  async unlinkGoogleAccount(userId: string) {
    await this.userService.unlinkGoogleAccount(userId);
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto) {
    await this.userService.update(userId, updateUserDto);
    return this.getProfile(userId);
  }

  async logout(userId: string, sessionId: string) {
    if (!userId || !sessionId) {
      throw new BadRequestError('userId and sessionId are required');
    }

    await this.redis
      .multi()
      // Xoá sessionID trong user_sessions
      .srem(`user_sessions:${userId}`, sessionId)
      // Xoá thông tin của sessionID (Là refresh token)
      .del(`session:${userId}:${sessionId}`)
      .exec();
  }

  async logoutAll(userId: string, excludeSessionId?: string) {
    let sessionIds = await this.redis.smembers(`user_sessions:${userId}`);
    if (sessionIds.length === 0) return;

    if (excludeSessionId) {
      sessionIds = sessionIds.filter((sid) => sid !== excludeSessionId);
    }

    if (sessionIds.length === 0) return;

    const sessionKeys = sessionIds.map((sid) => `session:${userId}:${sid}`);
    const pipeline = this.redis.multi();
    pipeline.del(sessionKeys);
    for (const sid of sessionIds) {
      pipeline.srem(`user_sessions:${userId}`, sid);
    }
    await pipeline.exec();
  }

  async listSessions(userId: string): Promise<SessionResponse[]> {
    const sessionIds = await this.redis.smembers(`user_sessions:${userId}`);
    const sessions = await Promise.all(
      sessionIds.map(async (sid) => {
        const stored = await this.redis.get(`session:${userId}:${sid}`);
        if (!stored) return null;
        try {
          const data = JSON.parse(stored) as SessionData;
          return plainToInstance(SessionResponse, {
            sessionId: sid,
            ipAddress: data.ipAddress || '',
            userAgent: data.userAgent || '',
            deviceName: data.deviceName || 'Unknown device',
            deviceKind: data.deviceKind || 'desktop',
            createdAt: data.createdAt || '',
            lastActive: data.lastActive || data.createdAt || '',
          });
        } catch {
          return plainToInstance(SessionResponse, {
            sessionId: sid,
            ipAddress: '',
            userAgent: '',
            deviceName: 'Unknown device',
            deviceKind: 'desktop',
            createdAt: '',
            lastActive: '',
          });
        }
      }),
    );
    return compact(sessions);
  }
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issueSession(
    user: User,
    deviceInfo?: { ipAddress?: string; userAgent?: string },
    sessionId: string = randomUUID(),
    existingSession?: SessionData,
  ) {
    const userDetails = await this.userService.getUserDetailsById(user.id);
    const payload = { sub: user.id, details: userDetails, sessionId };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.getOrThrow<string>(
        'jwt.refreshExpiresIn',
      ) as unknown as Required<JwtModuleOptions>['signOptions']['expiresIn'],
    });

    const now = new Date().toISOString();
    const deviceName = deviceInfo?.userAgent
      ? this.parseUserAgent(deviceInfo.userAgent)
      : existingSession?.deviceName || 'Unknown device';
    const sessionData: SessionData = {
      refreshTokenHash: this.hashToken(refreshToken),
      ipAddress: deviceInfo?.ipAddress ?? existingSession?.ipAddress ?? '',
      userAgent: deviceInfo?.userAgent ?? existingSession?.userAgent ?? '',
      deviceName,
      deviceKind: this.getDeviceKind(deviceName),
      createdAt: existingSession?.createdAt ?? now,
      lastActive: now,
    };

    const sessionKey = `session:${user.id}:${sessionId}`;
    const ttl = this.refreshTtlSeconds();
    await this.redis
      .multi()
      .sadd(`user_sessions:${user.id}`, sessionId)
      .set(sessionKey, JSON.stringify(sessionData), 'EX', ttl)
      .exec();

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
      sessionId,
    };
  }

  getGoogleAuthorizationUrl(userId?: string) {
    const clientId = this.configService.get<string>('google.clientId');
    const callback = this.configService.get<string>('google.callbackUrl');
    if (!clientId || !callback)
      throw new BadRequestError('Google OAuth is not configured');
    const state = userId
      ? this.jwtService.sign({ sub: userId }, { expiresIn: '10m' })
      : '';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callback,
      response_type: 'code',
      scope:
        this.configService.get<string>('google.scopes') ??
        'openid profile email',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async googleCallback(code: string, state?: string) {
    const clientId = this.configService.get<string>('google.clientId');
    const clientSecret = this.configService.get<string>('google.clientSecret');
    const redirectUri = this.configService.get<string>('google.callbackUrl');
    if (!clientId || !clientSecret || !redirectUri)
      throw new BadRequestError('Google OAuth is not configured');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok)
      throw new UnauthorizedError('Google authorization failed');
    const tokens = (await tokenResponse.json()) as { access_token?: string };
    const profileResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { authorization: `Bearer ${tokens.access_token}` } },
    );
    if (!profileResponse.ok)
      throw new UnauthorizedError('Unable to read Google profile');
    const profile = (await profileResponse.json()) as {
      sub: string;
      email: string;
    };
    let user = state
      ? await this.userService.getById(
          this.jwtService.verify<{ sub: string }>(state).sub,
        )
      : await this.userService.findOneByGoogleId(profile.sub);
    if (state) {
      if (!user) throw new UnauthorizedError('Account no longer exists');
      const linked = await this.userService.findOneByGoogleId(profile.sub);
      if (linked && linked.id !== user.id)
        throw new ConflictError('Google account is already linked');
      user = await this.userService.linkGoogleAccount(
        user.id,
        profile.sub,
        profile.email,
      );
    } else if (!user) {
      user = await this.userService.findOneByEmail(profile.email);
    }
    if (!user)
      throw new UnauthorizedError('No account matches this Google account');
    if (!(await this.userService.getGoogleAccount(user.id))) {
      user = await this.userService.linkGoogleAccount(
        user.id,
        profile.sub,
        profile.email,
      );
      if (!user) throw new UnauthorizedError('Unable to link Google account');
    }
    const session = await this.issueSession(user);
    return session;
  }

  private refreshTtlSeconds(): number {
    const value =
      this.configService.get<string>('jwt.refreshExpiresIn') ?? '7d';
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) return 604800;
    const units = { s: 1, m: 60, h: 3600, d: 86400 } as const;
    return Number(match[1]) * units[match[2] as keyof typeof units];
  }
}

interface SessionData {
  refreshTokenHash: string;
  ipAddress: string;
  userAgent: string;
  deviceName: string;
  deviceKind: string;
  createdAt: string;
  lastActive: string;
}
