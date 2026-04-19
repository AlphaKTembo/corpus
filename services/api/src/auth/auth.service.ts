import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';

export interface JwtPayload {
  sub: string;   // user UUID
  username: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly refreshSecret: string;
  private readonly refreshExpiresIn: string;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    this.refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET', 'change-me-refresh');
    this.refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d');
  }

  async validateUser(identifier: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmailOrUsername(identifier);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  private buildTokens(user: User): AuthTokens {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      email: user.email,
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresIn,
    });
    return { accessToken, expiresIn: 900, refreshToken };
  }

  async login(identifier: string, password: string): Promise<AuthTokens> {
    const user = await this.validateUser(identifier, password);
    return this.buildTokens(user);
  }

  async register(email: string, username: string, password: string): Promise<AuthTokens> {
    const user = await this.usersService.create({ email, username, password });
    return this.buildTokens(user);
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) throw new UnauthorizedException('User not found');

      const newPayload: JwtPayload = { sub: user.id, username: user.username, email: user.email };
      const accessToken = this.jwtService.sign(newPayload);
      return { accessToken, expiresIn: 900 };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async validateJwtPayload(payload: JwtPayload): Promise<{ id: string; username: string; email: string }> {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid token');
    return { id: user.id, username: user.username, email: user.email };
  }
}
