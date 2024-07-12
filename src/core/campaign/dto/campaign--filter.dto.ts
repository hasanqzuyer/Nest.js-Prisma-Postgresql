import { IsBoolean, IsOptional } from 'class-validator';
import { Status } from '../enums';
import { Transform } from 'class-transformer';

export class CampaignFilterDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(Number);
    }
    return value;
  })
  status?: Status[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ obj }) => (obj.withNoReportOnly === 'true' ? true : false))
  withNoReportOnly?: boolean;
}
