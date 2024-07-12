import { Module } from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';
import { PrismaModule } from 'src/integrations/prisma/prisma.module';
import { PlatformProductModule } from '../platform-product/platform-product.module';

@Module({
  imports: [PrismaModule, PlatformProductModule],
  controllers: [CampaignController],
  providers: [CampaignService],
})
export class CampaignModule {}
