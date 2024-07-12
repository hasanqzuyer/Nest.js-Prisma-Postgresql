import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GraphParamsDto } from '../dto/graph-params.dto';
import { CheckAbilities } from 'src/core/auth/ability/decorators/ability.decorator';
import { Action } from 'src/core/auth/ability';
import { GraphResultEntity } from '../entities/graph-result.entity';
import { ReportsInsightService } from './report-insight.service';
import { CampaignFilterParamsDto } from '../campaigns/dto/filter-params.dto';

@Controller('insight/reports')
@ApiTags('insight', 'report')
export class ReportsInsightController {
  constructor(private readonly reportsService: ReportsInsightService) {}

  @Get('reportsOverTimeData')
  @CheckAbilities({ action: Action.Manage, subject: 'CampaignReport' })
  @ApiOperation({
    summary: 'Return a number of reports (graph data)',
    description:
      'Retrieves a number of campaigns through time within given time period.',
  })
  @ApiOkResponse({
    type: GraphResultEntity,
  })
  async campaignsOverTimeData(
    @Query() graphParams: GraphParamsDto,
    @Query() campaignFilterParamsDto: CampaignFilterParamsDto,
  ) {
    return new GraphResultEntity(
      await this.reportsService.getReportsCountData(
        graphParams,
        campaignFilterParamsDto,
      ),
    );
  }
}
