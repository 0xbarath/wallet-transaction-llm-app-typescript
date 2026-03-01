import { IsOptional, IsInt, Min, IsISO8601 } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SyncRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  lookbackDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  endTime?: string;
}
