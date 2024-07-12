import {
  Get,
  Post,
  Body,
  Param,
  Controller,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import { AuthUser } from '../auth/decorators';
import { User } from '@prisma/client';
import {
  CreateTransactionFlowDto,
  CreateWithdrawTransactionDto,
  FinanceQueryParamsDto,
} from './dto';
import { TransactionEntity, TransactionFlowEntity } from './entities';
import { ApiTags } from '@nestjs/swagger';

@Controller('finance')
@ApiTags('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('balance')
  async getBalance(@AuthUser() user: User) {
    return this.financeService.getBalance(user.id);
  }

  @Get()
  async getAllTransactions(@Query() dto: FinanceQueryParamsDto) {
    return await this.financeService.getAllTransactions(dto);
  }

  @Get('transactions')
  async getTransactions(@AuthUser() user: User) {
    const transactions = await this.financeService.getTransactions(user.id);
    return transactions.map(
      (transaction) => new TransactionEntity(transaction),
    );
  }

  @Get('transactionFlows')
  async getTransactionFlows(@AuthUser() user: User) {
    const transactionFlows = await this.financeService.getTransactionFlows(
      user.id,
    );
    return transactionFlows.map(
      (transactionFlow) => new TransactionFlowEntity(transactionFlow),
    );
  }

  @Post('transactionFlows')
  async createTransactionFlow(
    @AuthUser() user: User,
    @Body() dto: CreateTransactionFlowDto,
  ) {
    const transactionFlow = await this.financeService.createTransactionFlow(
      user.id,
      dto,
    );
    return new TransactionFlowEntity(transactionFlow);
  }

  @Post('transactionFlows/:id/approve')
  async approveTransactionFlow(@Param('id', ParseIntPipe) id: number) {
    const transaction = await this.financeService.approveTransactionFlow(id);
    return new TransactionEntity(transaction);
  }

  @Post('transactionFlows/:id/decline')
  async declineTransactionFlow(@Param('id', ParseIntPipe) id: number) {
    const transaction = await this.financeService.declineTransactionFlow(id);
    return new TransactionEntity(transaction);
  }

  @Post('withdrawFlows')
  async requestSalary(
    @AuthUser() user: User,
    @Body() dto: CreateWithdrawTransactionDto,
  ) {
    const transactionFlow = await this.financeService.createWithdrawTransaction(
      user.id,
      dto,
    );
    return new TransactionFlowEntity(transactionFlow);
  }

  @Post('withdrawFlows/:id/approve')
  async approveWithdrawTransactionFlow(@Param('id', ParseIntPipe) id: number) {
    const transaction =
      await this.financeService.approveWithdrawTransactionFlow(id);
    return new TransactionEntity(transaction);
  }

  @Post('withdrawFlows/:id/decline')
  async declineWithdrawTransactionFlow(@Param('id', ParseIntPipe) id: number) {
    const transaction =
      await this.financeService.declineWithdrawTransactionFlow(id);
    return new TransactionEntity(transaction);
  }
}
