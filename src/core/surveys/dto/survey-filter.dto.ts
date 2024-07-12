import { Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';
import { Status } from 'src/core/campaign/enums';

export class SurveyFilterDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(Number);
    }
    return value;
  })
  status?: Status[];
}
