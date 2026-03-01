import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { TransactionQueryService } from './transaction-query.service';
import { PromptParserService } from './prompt-parser.service';

@Module({
  controllers: [TransactionController],
  providers: [TransactionQueryService, PromptParserService],
  exports: [TransactionQueryService],
})
export class TransactionModule {}
