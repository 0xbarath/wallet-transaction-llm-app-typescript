import { Body, Controller, Param, Patch, Post, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { RegisterWalletDto } from './dto/register-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { SyncService } from '../sync/sync.service';
import { SyncRequestDto } from '../sync/dto/sync-request.dto';

@ApiTags('wallets')
@ApiSecurity('auth')
@ApiSecurity('role')
@Controller('v1/wallets')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly syncService: SyncService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Register a wallet' })
  @ApiResponse({ status: 201, description: 'Wallet registered' })
  @ApiResponse({ status: 409, description: 'Wallet already registered' })
  async register(@Body() dto: RegisterWalletDto) {
    return this.walletService.register(dto);
  }

  @Patch(':walletId')
  @ApiOperation({ summary: 'Update wallet label' })
  @ApiResponse({ status: 200, description: 'Wallet updated' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async update(@Param('walletId') walletId: string, @Body() dto: UpdateWalletDto) {
    return this.walletService.update(walletId, dto);
  }

  @Post(':walletId/sync')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sync wallet transactions from Alchemy' })
  @ApiResponse({ status: 200, description: 'Sync completed' })
  @ApiResponse({ status: 409, description: 'Sync already in progress' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async sync(@Param('walletId') walletId: string, @Body() dto: SyncRequestDto) {
    return this.syncService.sync(walletId, dto);
  }
}
