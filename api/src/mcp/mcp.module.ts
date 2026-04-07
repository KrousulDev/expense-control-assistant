import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { ProfilesModule } from '../profiles/profiles.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { BudgetsModule } from '../budgets/budgets.module';

@Module({
  imports: [
    ProfilesModule,
    CategoriesModule,
    TransactionsModule,
    BudgetsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
