import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/integrations/prisma/prisma.service';
import { getPeriods } from '../utils/period-generator';
import { GraphParamsDto } from '../dto/graph-params.dto';
import { Prisma } from '@prisma/client';
import { IGraphDataPoint } from '../interfaces/graph-data-point.interface';
import { IGraphResult } from '../interfaces/graph-result.interface';
import { graphQueryWhere } from '../utils/query-where';
import { Status } from 'src/core/campaign/enums/status.enum';

@Injectable()
export class FinanceInsightService {
  private readonly logger = new Logger(FinanceInsightService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async getFinanceRevenueData({
    useStrictPeriod,
    graphPeriod,
    numberOfPoints,
    graphType,
    maxResults,
    roundDateToDay,
    roundDateToMonth,
    includeOngoingPeriod,
    includePeriodBorders,
    includeData,
  }: GraphParamsDto) {
    const queryWhere: Prisma.PlatformProductOrderWhereInput = {
      status: { in: [Status.Finished, Status.Archived] },
    };
    const periods = getPeriods(
      graphPeriod,
      undefined,
      {
        includeOngoingPeriod, // ? true
        roundDateToDay, // ? true
        roundDateToMonth,
        numOfLastPeriods: maxResults,
      },
      this.logger,
    );
    const result: IGraphResult = { data: [] };

    for (const { dateFrom, dateTo } of periods) {
      const queryResult =
        await this.prismaService.platformProductOrder.aggregate({
          _sum: { budget: true },
          where: {
            ...graphQueryWhere(graphType, dateFrom, dateTo),
            ...queryWhere,
          },
        });
      const dataPoint: IGraphDataPoint = {
        value:
          queryResult._sum.budget !== null
            ? queryResult._sum.budget.toNumber()
            : 0,
        timestamp: dateFrom,
        dateFrom,
        dateTo,
      };

      if (includePeriodBorders) result.data.push(dataPoint);
      else {
        const { value, timestamp, ...periodBorders } = dataPoint;
        result.data.push({ value, timestamp });
      }
    }

    return result;
  }

  async getFinanceCostData({
    useStrictPeriod,
    graphPeriod,
    numberOfPoints,
    graphType,
    maxResults,
    roundDateToDay,
    roundDateToMonth,
    includeOngoingPeriod,
    includePeriodBorders,
    includeData,
  }: GraphParamsDto) {
    const queryWhere: Prisma.PlatformProductOrderInfluencerWhereInput = {
      status: { in: [Status.Finished, Status.Archived] },
      /* productOrder: {
        OR: {
          campaigns: {
            every: { status: { in: [Status.Finished, Status.Archived] } },
          },
          surveys: {
            every: { status: { in: [Status.Finished, Status.Archived] } },
          },
          socialMediaListenings: {
            every: { status: { in: [Status.Finished, Status.Archived] } },
          },
        },
      }, */
    };
    const periods = getPeriods(
      graphPeriod,
      undefined,
      {
        includeOngoingPeriod, // ? true
        roundDateToDay, // ? true
        roundDateToMonth,
        numOfLastPeriods: maxResults,
      },
      this.logger,
    );
    const result: IGraphResult = { data: [] };

    for (const { dateFrom, dateTo } of periods) {
      const queryResult =
        await this.prismaService.platformProductOrderInfluencer.aggregate({
          _sum: { agreedAmount: true },
          where: {
            ...graphQueryWhere(graphType, dateFrom, dateTo),
            ...queryWhere,
          },
        });
      const dataPoint: IGraphDataPoint = {
        value:
          queryResult._sum.agreedAmount !== null
            ? queryResult._sum.agreedAmount.toNumber()
            : 0,
        timestamp: dateFrom,
        dateFrom,
        dateTo,
      };

      if (includePeriodBorders) result.data.push(dataPoint);
      else {
        const { value, timestamp, ...periodBorders } = dataPoint;
        result.data.push({ value, timestamp });
      }
    }

    return result;
  }

  async getFinanceProfitData({
    useStrictPeriod,
    graphPeriod,
    numberOfPoints,
    graphType,
    maxResults,
    roundDateToDay,
    roundDateToMonth,
    includeOngoingPeriod,
    includePeriodBorders,
    includeData,
  }: GraphParamsDto) {
    const revenueData = await this.getFinanceRevenueData({
      graphPeriod,
      graphType,
      maxResults,
      roundDateToDay,
      roundDateToMonth,
      includeOngoingPeriod,
      includePeriodBorders,
    });
    const costData = await this.getFinanceCostData({
      graphPeriod,
      graphType,
      maxResults,
      roundDateToDay,
      roundDateToMonth,
      includeOngoingPeriod,
      includePeriodBorders,
    });
    const result: IGraphResult = { data: [] };

    for (let i = 0; i < revenueData.data.length; i++) {
      const dataPoint: IGraphDataPoint = {
        value: revenueData.data[i].value - costData.data[i].value,
        timestamp: revenueData.data[i].timestamp,
      };

      if (includePeriodBorders) {
        dataPoint.dateFrom = revenueData.data[i].dateFrom;
        dataPoint.dateTo = revenueData.data[i].dateTo;
      }

      result.data.push(dataPoint);
    }

    return result;
  }

  async getFinanceMarginData({
    useStrictPeriod,
    graphPeriod,
    numberOfPoints,
    graphType,
    maxResults,
    roundDateToDay,
    roundDateToMonth,
    includeOngoingPeriod,
    includePeriodBorders,
    includeData,
  }: GraphParamsDto) {
    const profitData = await this.getFinanceProfitData({
      graphPeriod,
      graphType,
      maxResults,
      roundDateToDay,
      roundDateToMonth,
      includeOngoingPeriod,
      includePeriodBorders,
    });
    const revenueData = await this.getFinanceRevenueData({
      graphPeriod,
      graphType,
      maxResults,
      roundDateToDay,
      roundDateToMonth,
      includeOngoingPeriod,
      includePeriodBorders,
    });

    const result: IGraphResult = { data: [] };

    for (let i = 0; i < profitData.data.length; i++) {
      const dataPoint: IGraphDataPoint = {
        value:
          revenueData.data[i].value !== 0
            ? profitData.data[i].value / revenueData.data[i].value
            : 0,
        timestamp: profitData.data[i].timestamp,
      };

      if (includePeriodBorders) {
        dataPoint.dateFrom = profitData.data[i].dateFrom;
        dataPoint.dateTo = profitData.data[i].dateTo;
      }

      result.data.push(dataPoint);
    }

    return result;
  }
}
