import { IsEnum, IsOptional } from 'class-validator';
import { SmlStatus } from 'src/utils/enums/sml-status.enum';

export class SMLFilterDto {
  @IsOptional()
  @IsEnum(SmlStatus)
  status?: SmlStatus;
}
