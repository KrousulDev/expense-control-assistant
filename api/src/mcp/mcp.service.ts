import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { BudgetsService } from '../budgets/budgets.service';
import { CategoriesService } from '../categories/categories.service';
import { ProfilesService } from '../profiles/profiles.service';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class McpService {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly categoriesService: CategoriesService,
    private readonly transactionsService: TransactionsService,
    private readonly budgetsService: BudgetsService,
  ) {}

  async handle(req: Request, res: Response, userId: string): Promise<void> {
    const server = this.buildServer(userId);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body as unknown);
    } catch (err) {
      console.error('[MCP] Error handling request:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  }

  private buildServer(userId: string): McpServer {
    const server = new McpServer({
      name: 'expense-control',
      version: '1.0.0',
    });

    server.registerTool(
      'get_user_context',
      {
        description:
          'Obtiene el perfil del usuario, categorías disponibles y presupuestos activos del mes actual.',
        inputSchema: z.object({}),
      },
      async () => {
        const [profile, categories, budgets] = await Promise.all([
          this.profilesService.findByUserId(userId),
          this.categoriesService.findAll(userId),
          this.budgetsService.list(userId),
        ]);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ profile, categories, budgets }, null, 2),
            },
          ],
        };
      },
    );

    server.registerTool(
      'list_transactions',
      {
        description:
          'Lista las transacciones del usuario con filtros opcionales de tipo, rango de fechas y paginación.',
        inputSchema: z.object({
          type: z
            .enum(['expense', 'income'])
            .optional()
            .describe('Tipo de transacción'),
          from: z
            .string()
            .optional()
            .describe('Fecha de inicio ISO 8601 (ej. 2024-01-01)'),
          to: z
            .string()
            .optional()
            .describe('Fecha de fin ISO 8601 (ej. 2024-02-01)'),
          page: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe('Página (empieza en 0, por defecto 0)'),
          pageSize: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe('Resultados por página (por defecto 20, máximo 100)'),
        }),
      },
      async (args) => {
        const transactions = await this.transactionsService.list(userId, args);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(transactions, null, 2),
            },
          ],
        };
      },
    );

    server.registerTool(
      'create_transaction',
      {
        description:
          'Crea una nueva transacción (gasto o ingreso) para el usuario autenticado.',
        inputSchema: z.object({
          type: z.enum(['expense', 'income']).describe('Tipo: gasto o ingreso'),
          amount: z.number().positive().describe('Monto positivo'),
          currency: z
            .string()
            .length(3)
            .optional()
            .describe('Código ISO de moneda (ej. MXN). Por defecto: MXN'),
          description: z
            .string()
            .optional()
            .describe('Descripción corta de la transacción'),
          categoryId: z
            .string()
            .uuid()
            .optional()
            .describe('UUID de la categoría (obtenible con get_user_context)'),
          occurredAt: z
            .string()
            .optional()
            .describe(
              'Fecha y hora ISO 8601 de la transacción (por defecto: ahora)',
            ),
          rawUserText: z
            .string()
            .optional()
            .describe('Texto libre original del usuario para auditoría'),
          classificationMeta: z
            .record(z.string(), z.unknown())
            .optional()
            .describe('Metadatos del modelo AI (ej. modelo, confidence)'),
        }),
      },
      async (args) => {
        const transaction = await this.transactionsService.create(userId, {
          ...args,
          sourceChannel: 'api',
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(transaction, null, 2),
            },
          ],
        };
      },
    );

    server.registerTool(
      'get_budget_status',
      {
        description:
          'Obtiene el estado de los presupuestos del usuario para un mes, comparando el límite definido con el gasto real acumulado.',
        inputSchema: z.object({
          month: z
            .string()
            .regex(/^\d{4}-\d{2}$/)
            .describe('Mes en formato YYYY-MM (ej. 2024-01)'),
        }),
      },
      async ({ month }) => {
        const monthStart = `${month}-01`;
        const nextMonthDate = new Date(`${month}-01`);
        nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
        const monthEnd = nextMonthDate.toISOString().slice(0, 10);

        const [budgets, expenses] = await Promise.all([
          this.budgetsService.list(userId, month),
          this.transactionsService.list(userId, {
            type: 'expense',
            from: monthStart,
            to: monthEnd,
            pageSize: 100,
          }),
        ]);

        const spentByCategory: Record<string, number> = {};
        for (const t of expenses) {
          const key = t.category_id ?? '__uncategorized__';
          spentByCategory[key] =
            (spentByCategory[key] ?? 0) + parseFloat(t.amount);
        }

        const summary = budgets.map((b) => {
          const spent =
            spentByCategory[b.category_id ?? '__uncategorized__'] ?? 0;
          return {
            ...b,
            spent,
            remaining: parseFloat(b.amount_limit) - spent,
          };
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      },
    );

    return server;
  }
}
