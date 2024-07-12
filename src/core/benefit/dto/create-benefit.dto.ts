import {
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateBenefitDto {
  @IsInt()
  @IsPositive()
  benefitPartnershipId: number;

  @IsString()
  @IsOptional()
  benefitCompanyLink?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsPositive()
  benefitCategoryId: number;

  @IsInt({ each: true })
  @IsPositive({ each: true })
  @IsArray()
  benefitLocations?: number[];
}
