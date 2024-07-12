import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAnswerChoiceDto {
  @IsString()
  @IsNotEmpty()
  answer: string;

  // TODO review
  /* @IsString()
  @IsOptional()
  answerInfo?: string; */

  @IsNumber()
  @IsOptional()
  order?: number;
}
