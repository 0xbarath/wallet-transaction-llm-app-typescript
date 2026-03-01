import { IsNotEmpty, IsOptional, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterWalletDto {
  @ApiProperty({ example: '0x1234567890abcdef1234567890abcdef12345678' })
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'Invalid EVM address' })
  address!: string;

  @ApiPropertyOptional({ default: 'eth-mainnet' })
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, { message: 'Network must be lowercase alphanumeric with hyphens' })
  network: string = 'eth-mainnet';

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(64)
  label?: string;
}
