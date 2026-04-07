import {
  Controller,
  Delete,
  Get,
  Headers,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import type { JwtPayload } from '../auth/jwt.strategy';
import { McpService } from './mcp.service';

@Controller('mcp')
export class McpController {
  constructor(
    private readonly mcpService: McpService,
    private readonly jwtService: JwtService,
  ) {}

  @Post()
  async handlePost(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('authorization') authHeader: string,
  ): Promise<void> {
    const payload = this.extractPayload(authHeader);
    await this.mcpService.handle(req, res, payload.sub);
  }

  @Get()
  handleGet(@Res() res: Response): void {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  }

  @Delete()
  handleDelete(@Res() res: Response): void {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  }

  private extractPayload(authHeader: string): JwtPayload {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header.',
      );
    }
    const token = authHeader.slice(7);
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }
}
