import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../integrations/prisma/prisma.service';
import {
  CreateBenefitCateogryDto,
  CreateBenefitDto,
  CreateBenefitSuggestionDto,
  EditBenefitCateogryDto,
  EditBenefitDto,
  EditBenefitSuggestionDto,
} from './dto';
import { Prisma, User } from '@prisma/client';
import { UserRole, formatCrud } from 'src/utils';
import { FilterParamsDto } from '../../utils/object-definitions/dtos/filter-params.dto';
import { filterRecordsFactory } from '../../utils/factories/filter-records.factory';

@Injectable()
export class BenefitService {
  constructor(private readonly prismaService: PrismaService) {}

  async getBenefits({ skip, take, sortBy }: FilterParamsDto) {
    const queryOrderBy: Prisma.Enumerable<Prisma.BenefitOrderByWithRelationInput> =
      (sortBy as any) || { createdAt: 'desc' };
    const queryInclude: Prisma.BenefitInclude = {
      benefitCategory: true,
      benefitLocations: {
        include: {
          location: true,
        },
      },
      benefitPartnership: true,
    };

    try {
      const result = await filterRecordsFactory(
        this.prismaService,
        (tx) => tx.benefit,
        {
          skip,
          take,
          orderBy: queryOrderBy,
          include: queryInclude,
        },
      )();

      return result;
    } catch (error) {
      throw error;
    }
  }

  async getBenefit(id: number) {
    const benefit = await this.prismaService.benefit.findFirstOrThrow({
      where: { id },
      include: {
        benefitCategory: true,
        benefitPartnership: true,
        benefitLocations: {
          include: {
            location: true,
          },
        },
      },
    });
    return benefit;
  }

  async createBenefit(dto: CreateBenefitDto) {
    const {
      benefitPartnershipId,
      benefitCategoryId,
      benefitCompanyLink,
      description,
      benefitLocations = [],
    } = dto;
    return await this.prismaService.benefit.create({
      data: {
        benefitPartnershipId,
        benefitCategoryId,
        benefitCompanyLink,
        description,
        benefitLocations: {
          createMany: {
            data: benefitLocations.map((x) => ({ locationId: x })),
          },
        },
      },
      include: {
        benefitCategory: true,
        benefitPartnership: true,
        benefitLocations: {
          include: {
            location: true,
          },
        },
      },
    });
  }

  async editBenefit(id: number, dto: EditBenefitDto) {
    const {
      benefitCategoryId,
      benefitCompanyLink,
      benefitPartnershipId,
      description,
      benefitLocations,
    } = dto;
    return await this.prismaService.benefit.update({
      where: {
        id,
      },
      data: {
        benefitCategoryId,
        benefitCompanyLink,
        benefitPartnershipId,
        description,
        benefitLocations: formatCrud({
          array: benefitLocations,
          notIn: ['locationId'],
          where: { benefitId: id },
          create: (locationId: number) => ({
            locationId,
          }),
        }),
      },
    });
  }

  async deleteBenefit(id: number) {
    return await this.prismaService.benefit.delete({ where: { id } });
  }

  async getBenefitPartnerships({ skip, take, sortBy }: FilterParamsDto) {
    const queryOrderBy: Prisma.Enumerable<Prisma.BenefitPartnershipOrderByWithRelationInput> =
      (sortBy as any) || { createdAt: 'desc' };

    try {
      const result = await filterRecordsFactory(
        this.prismaService,
        (tx) => tx.benefitPartnership,
        {
          skip,
          take,
          orderBy: queryOrderBy,
        },
      )();

      return result;
    } catch (error) {
      throw error;
    }
  }

  async getBenefitSuggestions(
    { skip, take, sortBy }: FilterParamsDto,
    user: User,
  ) {
    const queryOrderBy: Prisma.Enumerable<Prisma.BenefitSuggestionOrderByWithRelationInput> =
      (sortBy as any) || { createdAt: 'desc' };
    const queryInclude: Prisma.BenefitSuggestionInclude = {
      benefitUpvoteCounts: true,
    };

    const allInfluencerBenefitSuggestions =
      await this.prismaService.benefitSuggestion.findMany({
        where: {
          isApproved: false,
        },
        select: {
          id: true,
        },
      });
    const influencerBenefitSuggestions =
      await this.prismaService.benefitSuggestion.findMany({
        where: {
          author: {
            // make sure given user is an influencer
            role: UserRole.Influencer,
          },
          authorId: user.id,
          isApproved: false,
        },
        select: {
          id: true,
        },
      });
    let invisibleToUserBenefitSuggestions =
      allInfluencerBenefitSuggestions.slice();
    influencerBenefitSuggestions.map((benefitSuggestion) => {
      if (user.role === UserRole.Influencer) {
        // if I am an influencer, remove my suggestion from "ignore list"
        invisibleToUserBenefitSuggestions =
          invisibleToUserBenefitSuggestions.filter(
            (allBenefitSuggestion) =>
              allBenefitSuggestion.id !== benefitSuggestion.id,
          );
      }

      return benefitSuggestion;
    });

    const queryWhere: Prisma.BenefitSuggestionWhereInput = {
      OR: [
        {
          // if given user is influencer, show all his, but if it is not an influencer, forbid the ones from other influencer
          id: invisibleToUserBenefitSuggestions && {
            notIn: invisibleToUserBenefitSuggestions.map(
              (benefitSuggestion) => benefitSuggestion.id,
            ),
          },
        },
      ],
    };

    try {
      const result = await filterRecordsFactory(
        this.prismaService,
        (tx) => tx.benefitSuggestion,
        {
          skip,
          take,
          orderBy: queryOrderBy, // TODO order by upvote counts
          include: queryInclude,
          where: queryWhere,
        },
      )();

      return result;
    } catch (error) {
      throw error;
    }
  }

  async getBenefitSuggestion(id: number) {
    return await this.prismaService.benefitSuggestion.findFirstOrThrow({
      where: { id },
      include: {
        author: true,
      },
    });
  }

  async createBenefitSuggestion(
    authorId: number,
    dto: CreateBenefitSuggestionDto,
  ) {
    const {
      partnershipName,
      partnershipLink,
      argumentDescription,
      outcomeDescription,
    } = dto;

    return await this.prismaService.benefitSuggestion.create({
      data: {
        authorId,
        partnershipName,
        partnershipLink,
        argumentDescription,
        outcomeDescription,
      },
    });
  }

  async editBenefitSuggestion(id: number, dto: EditBenefitSuggestionDto) {
    const {
      argumentDescription,
      outcomeDescription,
      partnershipLink,
      partnershipName,
      statusDescription,
      isApproved,
    } = dto;

    return await this.prismaService.benefitSuggestion.update({
      where: {
        id,
      },
      data: {
        argumentDescription,
        outcomeDescription,
        partnershipLink,
        partnershipName,
        statusDescription,
        isApproved,
      },
    });
  }

  async deleteBenefitSuggestion(id: number) {
    return await this.prismaService.benefitSuggestion.delete({ where: { id } });
  }

  async upvoteBenefitSuggestion(benefitSuggestionId: number, userId: number) {
    await this.prismaService.benefitSuggestion.findFirstOrThrow({
      where: { id: benefitSuggestionId },
    });

    const upvote = await this.prismaService.benefitUpvoteCount.findFirst({
      where: {
        benefitSuggestionId,
        userId,
      },
    });

    if (upvote && !upvote.isUpvoted) {
      await this.prismaService.benefitUpvoteCount.update({
        where: { id: upvote.id },
        data: { isUpvoted: true },
      });
      return { isUpvoted: true };
    } else if (upvote && upvote.isUpvoted) {
      await this.prismaService.benefitUpvoteCount.delete({
        where: { id: upvote.id },
      });
      return { isUpvoted: null };
    } else if (!upvote) {
      await this.prismaService.benefitUpvoteCount.create({
        data: { benefitSuggestionId, userId, isUpvoted: true },
      });
      return { isUpvoted: true };
    }
  }

  async downvoteBenefitSuggestion(benefitSuggestionId: number, userId: number) {
    await this.prismaService.benefitSuggestion.findFirstOrThrow({
      where: { id: benefitSuggestionId },
    });

    const downvote = await this.prismaService.benefitUpvoteCount.findFirst({
      where: {
        benefitSuggestionId,
        userId,
      },
    });

    if (downvote && downvote.isUpvoted) {
      await this.prismaService.benefitUpvoteCount.update({
        where: { id: downvote.id },
        data: { isUpvoted: false },
      });
      return { isUpvoted: false };
    } else if (downvote && !downvote.isUpvoted) {
      await this.prismaService.benefitUpvoteCount.delete({
        where: { id: downvote.id },
      });
      return { isUpvoted: null };
    } else if (!downvote) {
      await this.prismaService.benefitUpvoteCount.create({
        data: { benefitSuggestionId, userId, isUpvoted: false },
      });
      return { isUpvoted: false };
    }
  }

  async getBenefitCategories() {
    return await this.prismaService.benefitCategory.findMany();
  }

  async createBenefitCategory(dto: CreateBenefitCateogryDto) {
    const { name } = dto;
    return await this.prismaService.benefitCategory.create({ data: { name } });
  }

  async editBenefitCategory(id: number, dto: EditBenefitCateogryDto) {
    const { name } = dto;

    const benefit = await this.prismaService.benefitCategory.update({
      where: { id },
      data: { name },
    });

    return benefit;
  }

  async deleteBenefitCategory(id: number) {
    const benefit = await this.prismaService.benefitCategory.delete({
      where: { id },
    });

    return benefit;
  }
}
