import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateRequest } from 'twilio';
import type { Request } from 'express';

@Injectable()
export class TwilioSignatureGuard implements CanActivate {
  private readonly logger = new Logger(TwilioSignatureGuard.name);
  private authToken: string;

  constructor(private readonly config: ConfigService) {
    this.authToken = this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const signature = req.headers['x-twilio-signature'] as string | undefined;
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    if (!signature) {
      this.logger.warn('Missing Twilio signature header');
      return false;
    }

    const valid = validateRequest(
      this.authToken,
      signature,
      url,
      req.body as Record<string, string>,
    );

    if (!valid) {
      this.logger.warn('Invalid Twilio signature');
    }
    return valid;
  }
}
