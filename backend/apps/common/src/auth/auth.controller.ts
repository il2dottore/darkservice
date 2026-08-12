import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoginDto } from './dtos/requests/login.dto';
import { AuthService } from './auth.service';
import { ApiBearerAuth, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { CreateUserDto } from '../user/dtos/requests/create-user.dto';
import { UpdateUserDto } from '../user/dtos/requests/update-user.dto';
import { JwtAuthGuard } from '@app/auth/guards/jwt-auth.guard';
import { RefreshTokenDto } from './dtos/requests/refresh-token.dto';
import { SessionResponse } from './dtos/responses/session-response';
import { ConfigService } from '@nestjs/config';
import { ForgotPasswordDto } from './dtos/requests/forgot-password.dto';
import { ResetPasswordDto } from './dtos/requests/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(JwtAuthGuard)
  google(@Req() request: { user: { sub: string } }, @Res() response: Response) {
    return response.redirect(
      this.authService.getGoogleAuthorizationUrl(request.user.sub),
    );
  }

  @Get('google/login')
  googleLogin(@Res() response: Response) {
    return response.redirect(this.authService.getGoogleAuthorizationUrl());
  }

  @Get('google/url')
  @UseGuards(JwtAuthGuard)
  googleUrl(@Req() request: { user: { sub: string } }) {
    return {
      url: this.authService.getGoogleAuthorizationUrl(request.user.sub),
    };
  }

  @Delete('google')
  @UseGuards(JwtAuthGuard)
  async unlinkGoogle(@Req() request: { user: { sub: string } }) {
    await this.authService.unlinkGoogleAccount(request.user.sub);
    return { success: true };
  }

  @Get('google/callback')
  async googleCallback(@Req() request: Request, @Res() response: Response) {
    const frontend =
      this.config.get<string>('google.frontendCallbackUrl') ??
      'http://localhost:5173/auth/google-callback';
    try {
      const session = await this.authService.googleCallback(
        request.query.code as string,
        request.query.state as string,
      );
      const params = new URLSearchParams({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        sessionId: session.sessionId,
      });
      return response.redirect(`${frontend}?${params}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Google sign-in failed';
      const linking = Boolean(request.query.state);
      const code =
        message === 'Google account is already linked'
          ? linking
            ? 'link-already-linked'
            : 'already-linked'
          : linking
            ? 'link-failed'
            : 'not-connected';
      return response.redirect(
        `${frontend}?errorCode=${code}&error=${encodeURIComponent(message)}`,
      );
    }
  }

  @ApiOperation({
    summary: 'Auth endpoint, login using username and password',
  })
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() request: Request) {
    const ipAddress =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (request.ip as string) ||
      '';
    const userAgent = (request.headers['user-agent'] as string) || '';
    return this.authService.login(loginDto, { ipAddress, userAgent });
  }

  @ApiOperation({
    summary: 'Register a new user account',
  })
  @Post('register')
  register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Get('verify-email')
  async verifyEmail(@Req() request: Request, @Res() response: Response) {
    const frontend =
      this.config.get<string>('mail.verifyEmailCallbackUrl') ??
      'http://localhost:5173/verify-email';
    try {
      await this.authService.verifyEmail(request.query.token as string);
      return response.redirect(`${frontend}?verified=true`);
    } catch {
      return response.redirect(`${frontend}?verified=false`);
    }
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @ApiOperation({ summary: 'Issue a new access token for an active session' })
  @Post('refresh')
  refresh(@Body() { refreshToken }: RefreshTokenDto) {
    return this.authService.refresh(refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  profile(@Req() request: { user: { sub: string } }) {
    return this.authService.getProfile(request.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch('me')
  updateProfile(
    @Req() request: { user: { sub: string } },
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.authService.updateProfile(request.user.sub, updateUserDto);
  }

  @ApiOperation({
    summary: 'Logout current session',
  })
  @HttpCode(200)
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async logout(@Body() body: { userId: string; sessionId: string }) {
    await this.authService.logout(body.userId, body.sessionId);
    return { success: true };
  }

  @ApiOperation({
    summary: 'List active sessions for a user',
  })
  @ApiOkResponse({ type: SessionResponse, isArray: true })
  @Get('sessions/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  listSessions(@Param('userId') userId: string) {
    return this.authService.listSessions(userId);
  }

  @ApiOperation({
    summary: 'Logout all active sessions for a user',
  })
  @HttpCode(200)
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async logoutAll(
    @Body() body: { userId: string },
    @Req() request: { user: { sub: string; sessionId: string } },
  ) {
    return this.authService
      .logoutAll(body.userId, request.user.sessionId)
      .then(() => ({ success: true }));
  }
}
