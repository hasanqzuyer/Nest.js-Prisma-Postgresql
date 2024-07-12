import { SurveyOption } from '@prisma/client';

export class AnswerEntity implements SurveyOption {
  id: number;
  surveyQuestionId: number;
  optionText: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<AnswerEntity>) {
    Object.assign(this, partial);
  }
}
