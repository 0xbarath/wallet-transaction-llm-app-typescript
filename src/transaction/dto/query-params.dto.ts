import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsISO8601,
  Matches,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QueryParamsDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsUUID()
  walletId!: string;

  @ApiPropertyOptional({ enum: ['IN', 'OUT'] })
  @IsOptional()
  @IsEnum(['IN', 'OUT'])
  direction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  asset?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  minValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  maxValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'Invalid counterparty address' })
  counterparty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @ApiPropertyOptional({ enum: ['createdAt_desc', 'createdAt_asc'] })
  @IsOptional()
  @IsEnum(['createdAt_desc', 'createdAt_asc'])
  sort?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
