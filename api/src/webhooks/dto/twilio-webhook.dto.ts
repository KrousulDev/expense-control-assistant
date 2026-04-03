export class TwilioWebhookDto {
  From!: string;
  Body!: string;
  MessageSid!: string;
  To?: string;
  NumMedia?: string;
}
