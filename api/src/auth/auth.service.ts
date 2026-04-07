import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string }> {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.db.query<UserRow>(
      'SELECT id FROM public.users WHERE email = $1',
      [email],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      throw new ConflictException('El email ya está registrado.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const { rows } = await this.db.query<UserRow>(
      `INSERT INTO public.users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email`,
      [email, passwordHash],
    );
    const user = rows[0];

    await this.db.query(
      `INSERT INTO public.profiles (id, display_name)
       VALUES ($1, $2)`,
      [user.id, dto.displayName ?? ''],
    );

    return { accessToken: this.sign(user.id, user.email) };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const email = dto.email.toLowerCase().trim();

    const { rows } = await this.db.query<UserRow>(
      'SELECT id, email, password_hash FROM public.users WHERE email = $1',
      [email],
    );

    const user = rows[0];
    if (!user) throw new UnauthorizedException('Credenciales inválidas.');

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas.');

    return { accessToken: this.sign(user.id, user.email) };
  }

  private sign(userId: string, email: string): string {
    return this.jwt.sign({ sub: userId, email });
  }
}
