import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../integrations/prisma/prisma.service';
import {
  CreateTransactionFlowDto,
  CreateWithdrawTransactionDto,
  FinanceQueryParamsDto,
} from './dto';
import {
  TransactionFlowType,
  TransactionStatus,
  withSelectors,
} from 'src/utils';
import {
  TransactionInsufficientFundsUnprocessableEntityException,
  TransactionOperationBadRequestException,
} from './exceptions';
import { Decimal } from '@prisma/client/runtime';
import { NotificationsService } from '../notifications/notifications.service';
import FinanceSelectors from './selectors';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getAllTransactions(dto: FinanceQueryParamsDto) {
    const { columns, filters, pagination } = dto;

    const data = await withSelectors(
      {
        columns,
        filters,
        pagination,
        service: this.prismaService,
        context: 'transactionFlow',
      },
      FinanceSelectors,
    );

    return data;
  }

  async getTransactions(userId: number) {
    return await this.prismaService.transaction.findMany({
      where: {
        transactionFlow: {
          userId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getTransactionFlows(userId: number) {
    return await this.prismaService.transactionFlow.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getLastTransaction(userId: number) {
    const transactions = await this.prismaService.transaction.findMany({
      where: {
        transactionFlow: {
          userId,
        },
      },
      take: 1,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return transactions.shift();
  }

  async getLastTransactionInFlow(transactionFlowId: number) {
    const transactions = await this.prismaService.transaction.findMany({
      where: {
        transactionFlowId,
      },
      include: {
        transactionFlow: true,
      },
      take: 1,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return transactions.shift();
  }

  async getBalance(userId: number) {
    const balance = {
      availableAmounts: 0,
      unavailableAmounts: 0,
    };

    const lastTransaction = await this.getLastTransaction(userId);

    if (lastTransaction) {
      balance.availableAmounts = lastTransaction.availableAmounts.toNumber();
      balance.unavailableAmounts =
        lastTransaction.unavailableAmounts.toNumber();
    }

    return balance;
  }

  async createTransactionFlow(userId: number, dto: CreateTransactionFlowDto) {
    const { name, vendorId, type, amount, productOrderId } = dto;

    const lastTransaction = await this.getLastTransaction(userId);

    const amounts = {
      availableAmounts: new Decimal(0),
      unavailableAmounts: new Decimal(0),
    };

    if (lastTransaction) {
      amounts.availableAmounts = lastTransaction.availableAmounts;
      amounts.unavailableAmounts = lastTransaction.unavailableAmounts;
    }

    const transactionFlow = await this.prismaService.transactionFlow.create({
      data: {
        name,
        vendorId,
        userId,
        type,
        amount,
        productOrderId,
      },
    });

    const transaction = await this.prismaService.transaction.create({
      data: {
        transactionFlowId: transactionFlow.id,
        ...amounts,
        status: TransactionStatus.Pending,
      },
    });

    await this.notificationsService.paymentRequested(
      userId,
      transaction.id,
      transactionFlow.id,
    );

    return transactionFlow;
  }

  async approveTransactionFlow(transactionFlowId: number) {
    const lastTransactionInFlow = await this.getLastTransactionInFlow(
      transactionFlowId,
    );

    if (lastTransactionInFlow.status !== TransactionStatus.Pending) {
      throw new TransactionOperationBadRequestException(
        transactionFlowId,
        'approve',
      );
    }

    const lastTransaction = await this.getLastTransaction(
      lastTransactionInFlow.transactionFlow.userId,
    );

    const transaction = await this.prismaService.transaction.create({
      data: {
        availableAmounts: lastTransaction.availableAmounts.add(
          lastTransactionInFlow.transactionFlow.amount,
        ),
        unavailableAmounts: lastTransaction.unavailableAmounts,
        transactionFlowId: lastTransactionInFlow.transactionFlowId,
        status: TransactionStatus.Approved,
      },
      include: {
        transactionFlow: true,
      },
    });

    await this.notificationsService.paymentApproved(
      transaction.transactionFlow.userId,
      transaction.id,
      transaction.transactionFlow.id,
    );

    return transaction;
  }

  async declineTransactionFlow(transactionFlowId: number) {
    const lastTransactionInFlow = await this.getLastTransactionInFlow(
      transactionFlowId,
    );

    if (lastTransactionInFlow.status !== TransactionStatus.Pending) {
      throw new TransactionOperationBadRequestException(
        transactionFlowId,
        'decline',
      );
    }

    const lastTransaction = await this.getLastTransaction(
      lastTransactionInFlow.transactionFlow.userId,
    );

    const transaction = await this.prismaService.transaction.create({
      data: {
        availableAmounts: lastTransaction.availableAmounts,
        unavailableAmounts: lastTransaction.unavailableAmounts,
        transactionFlowId: lastTransactionInFlow.transactionFlowId,
        status: TransactionStatus.Declined,
      },
      include: {
        transactionFlow: true,
      },
    });

    await this.notificationsService.paymentDeclined(
      transaction.transactionFlow.userId,
      transaction.id,
      transaction.transactionFlow.id,
    );

    return transaction;
  }

  async createWithdrawTransaction(
    userId: number,
    dto: CreateWithdrawTransactionDto,
  ) {
    const amount = new Decimal(dto.amount);

    const lastTransaction = await this.getLastTransaction(userId);

    const amounts = {
      availableAmounts: new Decimal(0),
      unavailableAmounts: new Decimal(0),
    };

    if (lastTransaction) {
      amounts.availableAmounts = lastTransaction.availableAmounts;
      amounts.unavailableAmounts = lastTransaction.unavailableAmounts;
    }

    if (amounts.availableAmounts.sub(amount).lessThan(new Decimal(0))) {
      throw new TransactionInsufficientFundsUnprocessableEntityException();
    }

    const transaction = await this.prismaService.transactionFlow.create({
      data: {
        userId,
        amount,
        type: TransactionFlowType.Withdrawal,
        transactions: {
          create: {
            status: TransactionStatus.Pending,
            availableAmounts: amounts.availableAmounts.sub(amount),
            unavailableAmounts: amounts.unavailableAmounts.add(amount),
          },
        },
      },
    });

    await this.notificationsService.withdrawRequested(userId, transaction.id);

    return transaction;
  }

  async approveWithdrawTransactionFlow(transactionFlowId: number) {
    const lastTransactionInFlow = await this.getLastTransactionInFlow(
      transactionFlowId,
    );

    if (lastTransactionInFlow.status !== TransactionStatus.Pending) {
      throw new TransactionOperationBadRequestException(
        transactionFlowId,
        'approve',
      );
    }

    const lastTransaction = await this.getLastTransaction(
      lastTransactionInFlow.transactionFlow.userId,
    );

    const transaction = await this.prismaService.transaction.create({
      data: {
        availableAmounts: lastTransaction.availableAmounts,
        unavailableAmounts: lastTransaction.unavailableAmounts.sub(
          lastTransactionInFlow.transactionFlow.amount,
        ),
        transactionFlowId: lastTransactionInFlow.transactionFlowId,
        status: TransactionStatus.Approved,
      },
      include: {
        transactionFlow: true,
      },
    });

    await this.notificationsService.withdrawApproved(
      transaction.transactionFlow.userId,
      transaction.id,
    );

    return transaction;
  }

  async declineWithdrawTransactionFlow(transactionFlowId: number) {
    const lastTransactionInFlow = await this.getLastTransactionInFlow(
      transactionFlowId,
    );

    if (lastTransactionInFlow.status !== TransactionStatus.Pending) {
      throw new TransactionOperationBadRequestException(
        transactionFlowId,
        'decline',
      );
    }

    const lastTransaction = await this.getLastTransaction(
      lastTransactionInFlow.transactionFlow.userId,
    );

    const transaction = await this.prismaService.transaction.create({
      data: {
        availableAmounts: lastTransaction.availableAmounts.add(
          lastTransactionInFlow.transactionFlow.amount,
        ),
        unavailableAmounts: lastTransaction.unavailableAmounts.sub(
          lastTransactionInFlow.transactionFlow.amount,
        ),
        transactionFlowId: lastTransactionInFlow.transactionFlowId,
        status: TransactionStatus.Declined,
      },
      include: {
        transactionFlow: true,
      },
    });

    await this.notificationsService.withdrawDeclined(
      transaction.transactionFlow.userId,
      transaction.id,
    );

    return transaction;
  }
}
