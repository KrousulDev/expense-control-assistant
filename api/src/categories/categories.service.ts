import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  slug: string;
  parent_id: string | null;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(userId: string): Promise<Category[]> {
    const { rows } = await this.db.query<Category>(
      `SELECT id, user_id, name, slug, parent_id, is_system, sort_order, created_at, updated_at
       FROM public.categories
       WHERE is_system = true OR user_id = $1
       ORDER BY sort_order ASC, name ASC`,
      [userId],
    );
    return rows;
  }
}
