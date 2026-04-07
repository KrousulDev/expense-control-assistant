import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null;
  month: string;
  amount_limit: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBudgetDto {
  month: string;
  amountLimit: number;
  currency?: string;
  categoryId?: string | null;
}

@Injectable()
export class BudgetsService {
  constructor(private readonly db: DatabaseService) {}

  async list(userId: string, month?: string): Promise<Budget[]> {
    const conditions = ['user_id = $1'];
    const params: unknown[] = [userId];

    if (month) {
      conditions.push('month = $2');
      params.push(month);
    }

    const { rows } = await this.db.query<Budget>(
      `SELECT id, user_id, category_id, month, amount_limit, currency, created_at, updated_at
       FROM public.budgets
       WHERE ${conditions.join(' AND ')}
       ORDER BY month DESC`,
      params,
    );
    return rows;
  }

  async create(userId: string, dto: CreateBudgetDto): Promise<Budget> {
    const { rows } = await this.db.query<Budget>(
      `INSERT INTO public.budgets (user_id, category_id, month, amount_limit, currency)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        userId,
        dto.categoryId ?? null,
        dto.month,
        dto.amountLimit,
        (dto.currency ?? 'MXN').toUpperCase(),
      ],
    );
    return rows[0];
  }

  async remove(userId: string, id: string): Promise<void> {
    const { rows } = await this.db.query<{ user_id: string }>(
      'SELECT user_id FROM public.budgets WHERE id = $1',
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Presupuesto no encontrado.');
    if (rows[0].user_id !== userId) throw new ForbiddenException();

    await this.db.query('DELETE FROM public.budgets WHERE id = $1', [id]);
  }
}
