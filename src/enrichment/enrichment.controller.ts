import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { AdminEnrichmentGuard } from '../common/guards/admin-enrichment.guard';
import { TransactionExplainService } from './transaction-explain.service';
import { ExplainRequestDto } from './dto/explain-request.dto';

@ApiTags('enrichment')
@ApiSecurity('auth')
@ApiSecurity('role')
@Controller('v1/transactions')
export class EnrichmentController {
  constructor(private readonly explainService: TransactionExplainService) {}

  @Post('explain')
  @UseGuards(AdminEnrichmentGuard)
  @ApiOperation({ summary: 'Explain a transaction (admin only)' })
  @ApiResponse({ status: 200, description: 'Transaction explained' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async explain(@Body() dto: ExplainRequestDto) {
    return this.explainService.explain(dto);
  }
}
