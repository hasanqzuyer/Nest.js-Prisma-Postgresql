import { Module, OnModuleInit } from '@nestjs/common';
import { InfluencerService } from './influencer.service';
import { InfluencerController } from './influencer.controller';
import { MailModule } from '../../integrations/mail/mail.module';
import { UsersModule } from '../../core/users/users.module';
import { CampaignDesiredIncomeController } from './subroutes/desired-income/campaign/campaign-desired-income.controller';
import { CampaignDesiredIncomeService } from './subroutes/desired-income/campaign/campaign-desired-income.service';
import { SurveyDesiredIncomeController } from './subroutes/desired-income/survey/survey-desired-income.controller';
import { SurveyDesiredIncomeService } from './subroutes/desired-income/survey/survey-desired-income.service';
import { SocialModule } from 'src/integrations/social/social.module';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';
import { InfluencerDistributionUpdateService } from './jobs/influencer-distribution-update.job';

@Module({
  imports: [MailModule, UsersModule, SocialModule, StakeholdersModule],
  providers: [
    InfluencerService,
    CampaignDesiredIncomeService,
    SurveyDesiredIncomeService,
    InfluencerDistributionUpdateService,
  ],
  controllers: [
    InfluencerController,
    CampaignDesiredIncomeController,
    SurveyDesiredIncomeController,
  ],
  exports: [CampaignDesiredIncomeService, InfluencerService],
})
export class InfluencerModule implements OnModuleInit {
  constructor(
    private readonly influencerDistributionUpdateService: InfluencerDistributionUpdateService,
  ) {}

  async onModuleInit() {
    // TODO uncomment await this.influencerDistributionUpdateService.updateInfluencerFollowersDistributionJob();
    // TODO uncomment this.influencerDistributionUpdateService.updateInfluencerSurveyDesiredAmountDistributionJob();
    // TODO uncomment this.influencerDistributionUpdateService.updateInfluencerCampaignDesiredAmountDistributionJob();
  }
}
