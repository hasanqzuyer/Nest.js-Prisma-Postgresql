import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/integrations/prisma/prisma.service';
import { UserStatus } from 'src/utils';
import { getPeriods } from '../utils/period-generator';
import { GraphParamsDto } from '../dto/graph-params.dto';
import { CampaignFilterParamsDto } from './dto/filter-params.dto';
import { Prisma } from '@prisma/client';
import { IGraphDataPoint } from '../interfaces/graph-data-point.interface';
import { IGraphResult } from '../interfaces/graph-result.interface';
import { graphQueryWhere } from '../utils/query-where';
import { PlatformProduct } from 'src/core/platform-product/enums/platform-product.enum';
import { Status } from 'src/core/campaign/enums/status.enum';

@Injectable()
export class CampaignsInsightService {
  private readonly logger = new Logger(CampaignsInsightService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async getCampaignsCountData(
    {
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
    }: GraphParamsDto,
    { status }: CampaignFilterParamsDto,
  ) {
    const queryWhere: Prisma.CampaignWhereInput = {
      platformProductOrder: { status },
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
      const queryResult = await this.prismaService.campaign.count({
        select: { _all: true },
        where: {
          ...graphQueryWhere(graphType, dateFrom, dateTo),
          ...queryWhere,
        },
      });
      const dataPoint: IGraphDataPoint = {
        value: queryResult._all,
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

  async getCampaignsRevenueData({
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
      platformProduct: PlatformProduct.Campaign,
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
}
