import { Injectable } from '@nestjs/common';
import { CreateStakeholderDto } from './dto/create-stakeholder.dto';
import { UpdateStakeholderDto } from './dto/update-stakeholder.dto';
import { PrismaService } from 'src/integrations/prisma/prisma.service';

import { FilterParamsDto } from 'src/utils/object-definitions/dtos/filter-params.dto';
import { calculateDOB } from 'src/utils';
import {
  FollowerStakeholderAggregateFiltersDto,
  FollowerStakeholderSimpleFiltersDto,
  InfluencerStakeholderAggregateFiltersDto,
  InfluencerStakeholderSimpleFiltersDto,
  InfluencerFilterDto,
} from './dto';
import { filterRecordsFactory } from 'src/utils/factories/filter-records.factory';
import { StakeholderType } from 'src/utils/enums/stakeholder-type.enum';
import { Prisma, Stakeholder } from '@prisma/client';
import { InstagramService } from 'src/integrations/social/instagram/instagram.service';
import { StakeholderException } from './exceptions/stakeholders.exception';

@Injectable()
export class StakeholdersService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly instagramService: InstagramService,
  ) {}

  static queryInclude: Prisma.StakeholderInclude = {
    influencer: { include: { user: true } },
  };
  static queryWhere: Prisma.StakeholderWhereInput = { isRegistered: true };

  /**
   * Returns multiple stakeholders based on criteria.
   *
   * @param query query filter
   * @param extraProperties properties to include in a response
   * @returns stakeholders matching the filter
   */
  async find(
    query: Prisma.StakeholderWhereInput,
    extraProperties?: Prisma.StakeholderInclude,
  ) {
    const stakeholders = await this.prismaService.stakeholder.findMany({
      where: query,
      include: extraProperties,
    });

    return stakeholders;
  }

  async create(
    createStakeholderDto: CreateStakeholderDto,
  ): Promise<Stakeholder> {
    try {
      const instagreamUserData =
        await this.instagramService.exchangeCodeForAccessToken(
          createStakeholderDto.authorizationCode,
          false,
        );

      const influencer = await this.prismaService.influencer.findUniqueOrThrow({
        where: { userId: createStakeholderDto.userId },
      });

      return await this.prismaService.stakeholder.create({
        data: {
          socialPlatformId: 1,
          socialPlatformUserId: instagreamUserData.userId.toString(),
          socialPlatformUsername: instagreamUserData.username,
          influencerId: influencer.id,
        },
      });
    } catch (error) {
      throw new StakeholderException(error.message);
    }
  }

  async findAllInfluencerStakeholders(
    { sortBy, skip, take }: FilterParamsDto,
    dto: InfluencerFilterDto,
  ) {
    const {
      ageMax,
      ageMin,
      joinedEnd,
      joinedStart,
      search,
      brands,
      diseaseAreas,
      ethnicities,
      experienceAs,
      genders,
      interests,
      keywords,
      labels,
      languages,
      locations,
      products,
      schedules,
      socialMedias,
      struggles,
      followersMax,
      followersMin,
      // search,
    } =
      dto.influencerStakeholderFilters as InfluencerStakeholderSimpleFiltersDto;

    const {
      commentsMax,
      commentsMin,
      engagementMax,
      engagementMin,
      likesMax,
      likesMin,
    } =
      dto.influencerStakeholderFilters as InfluencerStakeholderAggregateFiltersDto;

    const {
      ageMax: followerAgeMax,
      ageMin: followerAgeMin,
      brands: followerBrands,
      diseaseAreas: followerDiseaseAreas,
      ethnicities: followerEthnicities,
      genders: followerGenders,
      interests: followerInterests,
      keywords: followerKeywords,
      languages: followerLanguages,
      locations: followerLocations,
      products: followerProducts,
      struggles: followerStruggles,
      experienceAs: followerExperienceAs,
    } = dto.followerStakeholderFilters as FollowerStakeholderSimpleFiltersDto;

    const {
      brandsAbsoluteMin,
      brandsRelativeMin,
      stakeholderTypeAbsoluteMin,
      stakeholderTypeRelativeMin,
      ethnicitiesAbsoluteMin,
      ethnicitiesRelativeMin,
      interestsAbsoluteMin,
      interestsRelativeMin,
      strugglesAbsoluteMin,
      strugglesRelativeMin,
    } =
      dto.followerStakeholderFilters as FollowerStakeholderAggregateFiltersDto;

    const { minDOB, maxDOB } = calculateDOB(ageMin, ageMax);
    const { minDOB: followerMinDOB, maxDOB: followerMaxDOB } = calculateDOB(
      followerAgeMin,
      followerAgeMax,
    );

    const queryOrderBy: Prisma.Enumerable<Prisma.StakeholderOrderByWithRelationInput> =
      (sortBy as any) || { createdAt: 'desc' };

    const queryInclude: Prisma.StakeholderInclude = {
      influencer: { include: { user: true } },
    };
    const querySelect = Prisma.validator<Prisma.StakeholderSelect>()({
      id: true,
      followersCount: true,
      influencer: {
        select: {
          influencerFollowers: {
            select: {
              stakeholder: {
                select: {
                  id: true,
                  ethnicityId: true,
                  isPrivate: true,
                  type: true,
                  stakeholderPosts: {
                    select: {
                      id: true,
                      stakeholderId: true,
                      postBrands: { select: { brandId: true } },
                      postInterests: { select: { interestId: true } },
                      postStruggles: { select: { struggleId: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const queryWhere: Prisma.StakeholderPostWhereInput = {
      stakeholder: {
        ...StakeholdersService.queryWhere,
        influencerId: { not: null },
        influencer: {
          user: (labels || locations || schedules) && {
            assigneeUserLabels: labels && {
              some: { labelId: { in: labels } },
            },
            location: locations && {
              OR: [{ id: { in: locations } }, { countryId: { in: locations } }],
            },
            calendarEventAttendees: schedules && {
              some: { calendarEvent: { eventType: { in: schedules } } },
            },
          },
          influencerDiseaseAreas: diseaseAreas && {
            some: { diseaseAreaId: { in: diseaseAreas } },
          },
          ethnicityId: { in: ethnicities },
          dateOfBirth: { gte: minDOB, lte: maxDOB },
          gender: { in: genders },
          influencerFollowers: (followerMaxDOB ||
            followerMinDOB ||
            followerBrands ||
            followerDiseaseAreas ||
            followerEthnicities ||
            followerGenders ||
            followerInterests ||
            followerKeywords ||
            followerLanguages ||
            followerLocations ||
            followerProducts ||
            followerStruggles ||
            followerExperienceAs) && {
            some: {
              stakeholder: {
                OR: [
                  {
                    type: {
                      in: [StakeholderType.Patient, StakeholderType.Caregiver],
                    },
                    patientCaregiverDiseaseAreas: followerDiseaseAreas && {
                      some: { diseaseAreaId: { in: followerDiseaseAreas } },
                    },
                  },
                  {
                    type: {
                      in: [StakeholderType.Doctor, StakeholderType.Nurse],
                    },
                    stakeholderPosts: diseaseAreas && {
                      some: {
                        postDiseaseAreas: followerDiseaseAreas && {
                          some: { diseaseAreaId: { in: followerDiseaseAreas } },
                        },
                      },
                    },
                  },
                ],
                type: { in: experienceAs, not: StakeholderType.NonMedical },
                ethnicityId: { in: followerEthnicities },
                gender: { in: followerGenders },
                dateOfBirth: { gte: minDOB, lte: maxDOB },
                location: followerLocations && {
                  OR: [
                    { id: { in: followerLocations } },
                    { countryId: { in: followerLocations } },
                  ],
                },
                stakeholderPosts: (followerBrands ||
                  followerProducts ||
                  followerStruggles ||
                  followerInterests ||
                  followerKeywords ||
                  followerLanguages) && {
                  some: {
                    postBrands: followerBrands && {
                      some: {
                        brandId: {
                          in: followerBrands,
                        },
                      },
                    },
                    postProducts: followerProducts && {
                      some: { productId: { in: followerProducts } },
                    },
                    postStruggles: followerStruggles && {
                      some: { struggleId: { in: followerStruggles } },
                    },
                    postInterests: followerInterests && {
                      some: { interestId: { in: followerInterests } },
                    },
                    AND: followerKeywords?.map((keyword) => ({
                      content: { contains: keyword },
                    })),
                    language: { in: followerLanguages },
                  },
                },
              },
            },
          },
        },
        stakeholderPosts: (brands ||
          products ||
          interests ||
          keywords ||
          languages ||
          struggles) && {
          some: {
            postBrands: brands && { some: { brandId: { in: brands } } },
            postInterests: interests && {
              some: { interestId: { in: interests } },
            },
            postProducts: products && { some: { productId: { in: products } } },
            AND: keywords?.map((keyword) => ({
              content: { contains: keyword },
            })),
            language: { in: languages },
            postStruggles: struggles && {
              some: { struggleId: { in: struggles } },
            },
          },
        },
        type: { in: experienceAs },
        socialPlatformId: { in: socialMedias },
        followersCount: { gte: followersMin, lte: followersMax },
        socialPlatformUsername: { contains: search },
      },
    };

    const stakeholdersPostsAggregated =
      await this.prismaService.stakeholderPost.groupBy({
        by: ['stakeholderId'],
        _count: { stakeholderId: true },
        _sum: { likes: true, comments: true },
        having: (likesMin || likesMax || commentsMax || commentsMin) && {
          likes: { _avg: { gte: likesMin, lt: likesMax } },
          comments: { _avg: { gte: commentsMin, lt: commentsMax } },
        },
        where: queryWhere,
      });

    const stakeholdersWithFollowers =
      await this.prismaService.stakeholder.findMany({
        where: {
          id: {
            in: stakeholdersPostsAggregated.map((stak) => stak.stakeholderId),
          },
        },
        select: querySelect,
      });

    const promises = [];
    let filteredStakeholdersIds = [];
    if (
      engagementMin ||
      engagementMax ||
      brandsAbsoluteMin ||
      brandsRelativeMin ||
      stakeholderTypeAbsoluteMin ||
      stakeholderTypeRelativeMin ||
      ethnicitiesAbsoluteMin ||
      ethnicitiesRelativeMin ||
      interestsAbsoluteMin ||
      interestsRelativeMin ||
      strugglesAbsoluteMin ||
      strugglesRelativeMin
    ) {
      for (const item of stakeholdersWithFollowers) {
        promises.push(
          new Promise(async (res) => {
            const stats = {
              medicalTotalCount: 0,
              filteredBrandsCount: 0,
              filteredStakeholderTypeCount: 0,
              filteredEthnicitiesCount: 0,
              filteredInterestsCount: 0,
              filteredStrugglesCount: 0,
              nonMuggleAvailable: 0,
              followersCount: 0,
            };
            stats.followersCount = item.followersCount;

            const allFollowers = item.influencer.influencerFollowers.map(
              (fol) => fol.stakeholder,
            );

            const allFollowerIds = allFollowers.map((fol) => fol.id);

            stats.filteredBrandsCount = (
              await this.prismaService.stakeholderPost.groupBy({
                by: ['stakeholderId'],
                where: {
                  stakeholderId: { in: allFollowerIds },
                  postBrands: brands && { some: { brandId: { in: brands } } },
                },
              })
            ).length;

            stats.filteredStrugglesCount = (
              await this.prismaService.stakeholderPost.groupBy({
                by: ['stakeholderId'],
                where: {
                  stakeholderId: { in: allFollowerIds },
                  postStruggles: {
                    some: { struggleSentiment: { in: struggles } },
                  },
                },
              })
            ).length;

            stats.filteredStakeholderTypeCount = (
              await this.prismaService.stakeholderPost.groupBy({
                by: ['stakeholderId'],
                where: {
                  stakeholderId: { in: allFollowerIds },
                  stakeholder: { type: { in: experienceAs } },
                },
              })
            ).length;

            stats.filteredEthnicitiesCount = (
              await this.prismaService.stakeholderPost.groupBy({
                by: ['stakeholderId'],
                where: {
                  stakeholderId: { in: allFollowerIds },
                  stakeholder: { ethnicityId: { in: ethnicities } },
                },
              })
            ).length;

            stats.filteredInterestsCount = (
              await this.prismaService.stakeholderPost.groupBy({
                by: ['stakeholderId'],
                where: {
                  stakeholderId: { in: allFollowerIds },
                  postInterests: interests && {
                    some: { interestId: { in: interests } },
                  },
                },
              })
            ).length;

            stats.nonMuggleAvailable = allFollowers.filter((stak) => {
              if (
                stak.isPrivate === false &&
                stak.type !== StakeholderType.NonMedical
              )
                return true;
              return false;
            }).length;

            stats.medicalTotalCount = allFollowers.filter((stak) => {
              if (stak.type !== StakeholderType.NonMedical) return true;
              return false;
            }).length;

            let fulfills = true;

            const absoluteBrands =
              (stats.filteredBrandsCount / stats.nonMuggleAvailable) *
              stats.medicalTotalCount;
            const relativeBrands = absoluteBrands / stats.followersCount;

            if (brandsAbsoluteMin && fulfills) {
              fulfills = absoluteBrands >= brandsAbsoluteMin;
            }
            if (brandsRelativeMin && fulfills) {
              fulfills = relativeBrands >= brandsRelativeMin;
            }
            const absoluteInterests =
              (stats.filteredInterestsCount / stats.nonMuggleAvailable) *
              stats.medicalTotalCount;
            const relativeInterests = absoluteInterests / stats.followersCount;

            if (interestsAbsoluteMin && fulfills) {
              fulfills = absoluteInterests >= interestsAbsoluteMin;
            }
            if (interestsRelativeMin && fulfills) {
              fulfills = relativeInterests >= interestsRelativeMin;
            }

            const absoluteTypes =
              (stats.filteredStakeholderTypeCount / stats.nonMuggleAvailable) *
              stats.medicalTotalCount;
            const relativeTypes = absoluteTypes / stats.followersCount;

            if (stakeholderTypeAbsoluteMin && fulfills) {
              fulfills = absoluteTypes >= stakeholderTypeAbsoluteMin;
            }
            if (stakeholderTypeRelativeMin && fulfills) {
              fulfills = relativeTypes >= stakeholderTypeRelativeMin;
            }

            const absoluteStruggles =
              (stats.filteredStrugglesCount / stats.nonMuggleAvailable) *
              stats.medicalTotalCount;
            const relativeStruggles = absoluteStruggles / stats.followersCount;
            if (strugglesAbsoluteMin && fulfills) {
              fulfills = absoluteStruggles >= strugglesAbsoluteMin;
            }
            if (strugglesRelativeMin && fulfills) {
              fulfills = relativeStruggles >= strugglesRelativeMin;
            }

            const absoluteEthnicities =
              (stats.filteredEthnicitiesCount / stats.nonMuggleAvailable) *
              stats.medicalTotalCount;
            const relativeEthnicities =
              absoluteEthnicities / stats.followersCount;

            if (ethnicitiesAbsoluteMin && fulfills) {
              fulfills = absoluteEthnicities >= ethnicitiesAbsoluteMin;
            }
            if (ethnicitiesRelativeMin && fulfills) {
              fulfills = relativeEthnicities >= ethnicitiesRelativeMin;
            }

            const aggregates = stakeholdersPostsAggregated.find(
              (value) => value.stakeholderId === item.id,
            );

            const comms = aggregates._sum.comments;
            const likes = aggregates._sum.likes;
            const postsCount = aggregates._count.stakeholderId;
            const engagementAvg = (comms + likes) / postsCount;

            if (engagementMax && engagementMin && fulfills) {
              fulfills =
                engagementMin <= engagementAvg && engagementMax > engagementAvg;
            } else if (engagementMax && fulfills) {
              fulfills = engagementMax > engagementAvg;
            } else if (engagementMin && fulfills) {
              fulfills = engagementMin <= engagementAvg;
            }
            if (fulfills) {
              res(item.id);
            } else {
              res(undefined);
            }
          }),
        );
      }
    }

    for await (const res of promises) {
      filteredStakeholdersIds.push(res);
    }

    filteredStakeholdersIds = filteredStakeholdersIds.filter(
      (id) => id !== undefined,
    );

    const qWhere: Prisma.StakeholderWhereInput = {
      id: {
        in:
          filteredStakeholdersIds.length != 0
            ? filteredStakeholdersIds.map((id) => id)
            : stakeholdersWithFollowers.map((stak) => stak.id),
      },
    };

    return filterRecordsFactory(this.prismaService, (tx) => tx.stakeholder, {
      where: qWhere,
      include: queryInclude,
      orderBy: queryOrderBy,
      skip,
      take,
    })();
  }

  async update(id: number, updateStakeholderDto: UpdateStakeholderDto) {
    try {
      const stakeholder =
        await this.prismaService.stakeholder.findUniqueOrThrow({
          where: { id },
        });

      const updatedStakeholder = await this.prismaService.stakeholder.update({
        where: { id },
        data: {
          ...stakeholder,
          ...updateStakeholderDto,
        },
      });

      return updatedStakeholder;
    } catch (error) {
      throw new StakeholderException(error.message);
    }
  }

  remove(id: number) {
    return `This action removes a #${id} stakeholder`;
  }
}
