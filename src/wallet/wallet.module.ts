import { Module, forwardRef } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [forwardRef(() => SyncModule)],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
