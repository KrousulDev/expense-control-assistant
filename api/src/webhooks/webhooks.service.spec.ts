import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { InterpretResult } from 'ai';

jest.mock('ai', () => ({
  interpret: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { interpret } = require('ai') as {
  interpret: jest.MockedFunction<(input: unknown) => Promise<InterpretResult>>;
};

function makeSupabaseMock(profile: Record<string, unknown> | null) {
  const insertFn = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({ data: { id: 'tx-1' } }),
    }),
  });

  const client = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: profile }),
            }),
          }),
        };
      }
      if (table === 'categories') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                { id: 'cat-1', slug: 'comida', name: 'Comida' },
                { id: 'cat-2', slug: 'transporte', name: 'Transporte' },
              ],
            }),
          }),
        };
      }
      return { insert: insertFn };
    }),
  };

  return { client, insertFn };
}

describe('WebhooksService', () => {
  let service: WebhooksService;

  beforeEach(async () => {
    const { client } = makeSupabaseMock({
      id: 'user-1',
      default_currency: 'MXN',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: SupabaseService,
          useValue: { getClient: () => client },
        },
      ],
    }).compile();

    service = module.get(WebhooksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns linking message when profile not found', async () => {
    const { client } = makeSupabaseMock(null);
    const supabaseService = {
      getClient: () => client,
    } as unknown as SupabaseService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: SupabaseService, useValue: supabaseService },
      ],
    }).compile();

    const svc = module.get(WebhooksService);
    const reply = await svc.handleWhatsApp({
      From: 'whatsapp:+5215512345678',
      Body: 'gasté 200 en comida',
      MessageSid: 'SM123',
    });

    expect(reply).toContain('Vinculá tu número');
  });

  it('creates transaction and returns confirmation', async () => {
    interpret.mockResolvedValue({
      type: 'expense',
      amount: 200,
      currency: 'MXN',
      categorySlug: 'comida',
      description: 'Comida',
      confidence: 0.9,
      rawModelMeta: {},
    });

    const reply = await service.handleWhatsApp({
      From: 'whatsapp:+5215512345678',
      Body: 'gasté 200 en comida',
      MessageSid: 'SM456',
    });

    expect(reply).toContain('Gasto registrado');
    expect(reply).toContain('200');
    expect(reply).toContain('Comida');
  });

  it('returns error message on interpret failure', async () => {
    interpret.mockRejectedValue(new Error('API down'));

    const reply = await service.handleWhatsApp({
      From: 'whatsapp:+5215512345678',
      Body: 'blah blah',
      MessageSid: 'SM789',
    });

    expect(reply).toContain('No pude interpretar');
  });
});
