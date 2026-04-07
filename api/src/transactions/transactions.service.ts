import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface Transaction {
  id: string;
  user_id: string;
  type: 'expense' | 'income';
  amount: string;
  currency: string;
  occurred_at: string;
  description: string | null;
  category_id: string | null;
  source_channel: string;
  external_message_id: string | null;
  raw_user_text: string | null;
  classification_meta: Record<string, unknown>;
  category_overridden: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTransactionDto {
  type: 'expense' | 'income';
  amount: number;
  currency?: string;
  description?: string;
  categoryId?: string;
  occurredAt?: string;
  sourceChannel?: string;
  externalMessageId?: string;
  rawUserText?: string;
  classificationMeta?: Record<string, unknown>;
}

export interface UpdateTransactionDto {
  type?: 'expense' | 'income';
  amount?: number;
  description?: string | null;
  categoryId?: string | null;
  occurredAt?: string;
  categoryOverridden?: boolean;
}

export interface ListTransactionsQuery {
  page?: number;
  pageSize?: number;
  type?: 'expense' | 'income';
  from?: string;
  to?: string;
}

@Injectable()
export class TransactionsService {
  constructor(private readonly db: DatabaseService) {}

  async list(
    userId: string,
    query: ListTransactionsQuery,
  ): Promise<Transaction[]> {
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const offset = (query.page ?? 0) * pageSize;

    const conditions: string[] = ['t.user_id = $1'];
    const params: unknown[] = [userId];
    let idx = 2;

    if (query.type) {
      conditions.push(`t.type = $${idx++}`);
      params.push(query.type);
    }
    if (query.from) {
      conditions.push(`t.occurred_at >= $${idx++}`);
      params.push(query.from);
    }
    if (query.to) {
      conditions.push(`t.occurred_at < $${idx++}`);
      params.push(query.to);
    }

    params.push(pageSize, offset);

    const { rows } = await this.db.query<Transaction>(
      `SELECT t.id, t.user_id, t.type, t.amount, t.currency, t.occurred_at,
              t.description, t.category_id, t.source_channel, t.external_message_id,
              t.raw_user_text, t.classification_meta, t.category_overridden,
              t.created_at, t.updated_at
       FROM public.transactions t
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.occurred_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params,
    );
    return rows;
  }

  async create(
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<Transaction> {
    const { rows } = await this.db.query<Transaction>(
      `INSERT INTO public.transactions
         (user_id, type, amount, currency, description, category_id,
          source_channel, external_message_id, raw_user_text, classification_meta,
          occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        userId,
        dto.type,
        dto.amount,
        (dto.currency ?? 'MXN').toUpperCase(),
        dto.description ?? null,
        dto.categoryId ?? null,
        dto.sourceChannel ?? 'web',
        dto.externalMessageId ?? null,
        dto.rawUserText ?? null,
        JSON.stringify(dto.classificationMeta ?? {}),
        dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      ],
    );
    return rows[0];
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<Transaction> {
    await this.assertOwner(userId, id);

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.type !== undefined) {
      sets.push(`type = $${idx++}`);
      params.push(dto.type);
    }
    if (dto.amount !== undefined) {
      sets.push(`amount = $${idx++}`);
      params.push(dto.amount);
    }
    if (dto.description !== undefined) {
      sets.push(`description = $${idx++}`);
      params.push(dto.description);
    }
    if (dto.categoryId !== undefined) {
      sets.push(`category_id = $${idx++}`);
      params.push(dto.categoryId);
    }
    if (dto.occurredAt !== undefined) {
      sets.push(`occurred_at = $${idx++}`);
      params.push(new Date(dto.occurredAt));
    }
    if (dto.categoryOverridden !== undefined) {
      sets.push(`category_overridden = $${idx++}`);
      params.push(dto.categoryOverridden);
    }

    if (sets.length === 0) {
      const { rows } = await this.db.query<Transaction>(
        'SELECT * FROM public.transactions WHERE id = $1',
        [id],
      );
      return rows[0];
    }

    params.push(id);
    const { rows } = await this.db.query<Transaction>(
      `UPDATE public.transactions SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    return rows[0];
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.assertOwner(userId, id);
    await this.db.query('DELETE FROM public.transactions WHERE id = $1', [id]);
  }

  private async assertOwner(userId: string, id: string): Promise<void> {
    const { rows } = await this.db.query<{ user_id: string }>(
      'SELECT user_id FROM public.transactions WHERE id = $1',
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Transacción no encontrada.');
    if (rows[0].user_id !== userId) throw new ForbiddenException();
  }
}
