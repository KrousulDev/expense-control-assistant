import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface Profile {
  id: string;
  display_name: string | null;
  whatsapp_phone_e164: string | null;
  default_currency: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateProfileDto {
  displayName?: string | null;
  whatsappPhoneE164?: string | null;
  defaultCurrency?: string;
  timezone?: string;
}

@Injectable()
export class ProfilesService {
  constructor(private readonly db: DatabaseService) {}

  async findByUserId(userId: string): Promise<Profile> {
    const { rows } = await this.db.query<Profile>(
      `SELECT id, display_name, whatsapp_phone_e164, default_currency, timezone, created_at, updated_at
       FROM public.profiles WHERE id = $1`,
      [userId],
    );
    if (!rows[0]) throw new NotFoundException('Perfil no encontrado.');
    return rows[0];
  }

  async update(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.displayName !== undefined) {
      sets.push(`display_name = $${idx++}`);
      params.push(dto.displayName ?? null);
    }
    if (dto.whatsappPhoneE164 !== undefined) {
      sets.push(`whatsapp_phone_e164 = $${idx++}`);
      params.push(dto.whatsappPhoneE164 || null);
    }
    if (dto.defaultCurrency !== undefined) {
      sets.push(`default_currency = $${idx++}`);
      params.push(dto.defaultCurrency.toUpperCase());
    }
    if (dto.timezone !== undefined) {
      sets.push(`timezone = $${idx++}`);
      params.push(dto.timezone);
    }

    if (sets.length === 0) return this.findByUserId(userId);

    params.push(userId);

    try {
      const { rows } = await this.db.query<Profile>(
        `UPDATE public.profiles SET ${sets.join(', ')} WHERE id = $${idx}
         RETURNING id, display_name, whatsapp_phone_e164, default_currency, timezone, created_at, updated_at`,
        params,
      );
      if (!rows[0]) throw new NotFoundException('Perfil no encontrado.');
      return rows[0];
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        throw new ConflictException(
          'Ese número de WhatsApp ya está registrado en otra cuenta.',
        );
      }
      throw err;
    }
  }
}
