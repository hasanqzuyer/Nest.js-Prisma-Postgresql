import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { InfluencerType } from 'src/core/influencer/enums/influencer-type.enum';

export class CreateStakeholderDto {
  @IsString()
  @IsOptional()
  readonly authorizationCode?: string;

  @IsNumber()
  @IsOptional()
  readonly userId?: number;

  @IsEnum(InfluencerType)
  @IsOptional()
  readonly type?: InfluencerType;
}
