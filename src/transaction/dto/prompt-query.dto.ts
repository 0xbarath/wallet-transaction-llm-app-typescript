import { IsNotEmpty, IsOptional, IsString, IsInt, Min, Max, MaxLength, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PromptQueryDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsUUID()
  walletId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @MaxLength(2000)
  prompt!: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}
