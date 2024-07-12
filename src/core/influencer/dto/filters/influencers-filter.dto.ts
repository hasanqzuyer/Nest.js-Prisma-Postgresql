import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
// import { UserStatus } from 'src/utils';
import { InfluencerType } from '../../enums/influencer-type.enum';
import { Gender } from 'src/core/users/enums/gender';

export class InfluencersFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  /* @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  stage?: 'registered' | 'toBeApproved'; */

  @IsOptional()
  @IsNumber()
  ethnicityId?: number;

  @IsOptional()
  @IsNumber()
  followersMin?: number;

  @IsOptional()
  @IsNumber()
  followersMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsArray()
  diseaseAreaIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsArray()
  locationIds?: number[];

  @IsOptional()
  @IsNumber()
  ageMin?: number;

  @IsOptional()
  @IsNumber()
  ageMax?: number;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsEnum(InfluencerType)
  experienceAs?: InfluencerType;

  @IsOptional()
  @Type(() => Number)
  @IsArray()
  labelIds?: number[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ obj }) => (obj.hasLabel === 'true' ? true : false))
  hasLabel?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsArray()
  scheduleIds?: number[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ obj }) => (obj.hasSchedule === 'true' ? true : false))
  hasSchedule?: boolean;

  @IsOptional()
  @IsNumber()
  socialMediaId?: number;

  @IsOptional()
  @IsDate()
  joinedFrom?: Date;

  @IsOptional()
  @IsDate()
  joinedTo?: Date;
}
