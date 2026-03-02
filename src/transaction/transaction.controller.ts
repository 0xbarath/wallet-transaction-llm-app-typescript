import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { TransactionQueryService } from './transaction-query.service';
import { PromptParserService } from './prompt-parser.service';
import { QueryParamsDto } from './dto/query-params.dto';
import { PromptQueryDto } from './dto/prompt-query.dto';
import { normalizeQuerySpec } from './types/query-spec';
import { Role } from '../common/decorators/role.decorator';

@ApiTags('transactions')
@ApiSecurity('auth')
@ApiSecurity('role')
@Controller('v1/transactions')
export class TransactionController {
  constructor(
    private readonly queryService: TransactionQueryService,
    private readonly promptParser: PromptParserService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Query transactions with filters' })
  async query(@Query() params: QueryParamsDto, @Role() role: string) {
    const categories = params.category
      ? params.category.split(',').map((c) => c.trim().toUpperCase())
      : undefined;
    const assets = params.asset
      ? params.asset.split(',').map((a) => a.trim().toUpperCase())
      : undefined;

    const spec = normalizeQuerySpec({
      walletId: params.walletId,
      direction: params.direction,
      categories,
      assets,
      minValue: params.minValue,
      maxValue: params.maxValue,
      counterparty: params.counterparty,
      startTime: params.startTime,
      endTime: params.endTime,
      sort: params.sort,
      limit: params.limit,
      cursor: params.cursor,
    });

    return this.queryService.query(spec, role);
  }

  @Post('query')
  @ApiOperation({ summary: 'Natural language transaction query' })
  async promptQuery(@Body() dto: PromptQueryDto, @Role() role: string) {
    const spec = await this.promptParser.parse(dto.prompt, dto.walletId, role);

    if (dto.limit) spec.limit = Math.min(dto.limit, 200);
    if (dto.cursor) spec.cursor = dto.cursor;

    return this.queryService.query(spec, role);
  }
}
