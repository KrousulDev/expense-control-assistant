import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { interpret } from 'ai';
import type { InterpretResult } from 'ai';
import type { TwilioWebhookDto } from './dto/twilio-webhook.dto';

interface ProfileRow {
  id: string;
  default_currency: string;
}

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async handleWhatsApp(dto: TwilioWebhookDto): Promise<string> {
    const client = this.supabase.getClient();
    const phone = dto.From.replace('whatsapp:', '');

    const { data: profileData, error: profileError } = await client
      .from('profiles')
      .select('id, default_currency')
      .eq('whatsapp_phone_e164', phone)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      this.logger.error(
        `Supabase error looking up phone ${phone}: [${profileError.code}] ${profileError.message}`,
      );
    }

    const profile = profileData as ProfileRow | null;

    if (!profile) {
      this.logger.warn(`No profile found for phone ${phone}`);
      return 'No encontré tu cuenta. Vinculá tu número de WhatsApp en el panel web para empezar a registrar movimientos.';
    }

    await client.from('conversation_messages').insert({
      user_id: profile.id,
      direction: 'inbound' as const,
      body: dto.Body,
      external_message_id: dto.MessageSid,
      source_channel: 'whatsapp' as const,
    });

    const { data: categoriesData } = await client
      .from('categories')
      .select('id, slug, name')
      .eq('is_system', true);

    const categories = (categoriesData ?? []) as CategoryRow[];
    const slugs = categories.map((c) => c.slug);
    const slugToId = new Map(categories.map((c) => [c.slug, c.id]));
    const slugToName = new Map(categories.map((c) => [c.slug, c.name]));

    try {
      const result: InterpretResult = await interpret({
        text: dto.Body,
        defaultCurrency: profile.default_currency,
        categorySlugs: slugs,
      });

      const categoryId = result.categorySlug
        ? (slugToId.get(result.categorySlug) ?? null)
        : null;

      const { data: tx } = await client
        .from('transactions')
        .insert({
          user_id: profile.id,
          type: result.type,
          amount: result.amount,
          currency: result.currency,
          description: result.description,
          category_id: categoryId,
          source_channel: 'whatsapp' as const,
          external_message_id: dto.MessageSid,
          raw_user_text: dto.Body,
          classification_meta: result.rawModelMeta,
        })
        .select('id')
        .single();

      const txId: string | null = (tx as { id: string } | null)?.id ?? null;

      const categoryName = result.categorySlug
        ? (slugToName.get(result.categorySlug) ?? null)
        : null;

      const typeLabel = result.type === 'expense' ? 'Gasto' : 'Ingreso';
      const catLabel = categoryName ? ` (${categoryName})` : '';
      const reply = `${typeLabel} registrado: $${result.amount.toLocaleString()} ${result.currency}${catLabel} — ${result.description}`;

      await client.from('conversation_messages').insert({
        user_id: profile.id,
        direction: 'outbound' as const,
        body: reply,
        source_channel: 'whatsapp' as const,
        transaction_id: txId,
        metadata: { template: 'transaction_success' },
      });

      return reply;
    } catch (err) {
      this.logger.error('Failed to interpret message', err);

      const errorReply =
        'No pude interpretar tu mensaje. Intenta algo como "gasté 200 en comida" o "me pagaron 5000".';

      await client.from('conversation_messages').insert({
        user_id: profile.id,
        direction: 'outbound' as const,
        body: errorReply,
        source_channel: 'whatsapp' as const,
        metadata: {
          template: 'interpretation_error',
          error: err instanceof Error ? err.message : String(err),
        },
      });

      return errorReply;
    }
  }
}
