import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { TwilioSignatureGuard } from './twilio-signature.guard';
import type { TwilioWebhookDto } from './dto/twilio-webhook.dto';
import type { Response } from 'express';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('twilio/whatsapp')
  //@UseGuards(TwilioSignatureGuard)
  async handleWhatsApp(@Body() dto: TwilioWebhookDto, @Res() res: Response) {
    const reply = await this.webhooksService.handleWhatsApp(dto);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${this.escapeXml(reply)}</Message></Response>`;
    res.type('text/xml').send(twiml);
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
