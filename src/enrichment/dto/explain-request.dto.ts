import { IsNotEmpty, IsOptional, IsString, IsBoolean, IsIn, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExplainRequestDto {
  @ApiProperty({ example: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' })
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{64}$/, { message: 'Invalid transaction hash' })
  txHash!: string;

  @ApiPropertyOptional({ default: 'eth-mainnet' })
  @IsOptional()
  @IsString()
  network: string = 'eth-mainnet';

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  explain: boolean = true;

  @ApiPropertyOptional({ default: 'json', enum: ['json', 'human'] })
  @IsOptional()
  @IsIn(['json', 'human'])
  format: string = 'json';
}
