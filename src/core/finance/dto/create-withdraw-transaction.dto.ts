import { IsNumber, IsPositive } from 'class-validator';

export class CreateWithdrawTransactionDto {
  @IsNumber()
  @IsPositive()
  amount: number;
}
