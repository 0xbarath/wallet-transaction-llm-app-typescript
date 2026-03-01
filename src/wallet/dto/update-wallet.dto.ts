import { IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWalletDto {
  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(64)
  label?: string;
}
