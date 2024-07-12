import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Influencer,
  InfluencerCampaignAmount,
  InfluencerDiseaseArea,
  InfluencerSurveyAmount,
  Prisma,
  Stakeholder,
  SocialPlatform as SocialPlatformModel,
  User,
  PatientCaregiverDiseaseArea,
  DiseaseArea,
  Location,
  Ethnicity,
  UserLabel,
  Label,
} from '@prisma/client';
import { InfluencerRegistrationDto } from '../influencer/dto/influencer-registration.dto';
import { MailService } from '../../integrations/mail/mail.service';
import {
  Hash,
  UserRole,
  UserStatus,
  calculateDOB,
  generateAffiliateCode,
} from '../../utils';
import { PrismaService } from '../../integrations/prisma/prisma.service';
import { throwIfEmailExists } from '../users/exceptions/utils/email-exists';
import { FilterParamsDto } from './dto/query-params/filter-params.dto';
import { filterRecordsFactory } from 'src/utils/factories/filter-records.factory';
import { PaginationParamsDto } from 'src/utils/object-definitions/dtos/pagination-params.dto';
import { PaginationResult } from 'src/utils/object-definitions/results/pagination-result';
import { InfluencerRegistrationViaInvitationDto } from './dto/influencer-registration-via-invitation.dto';
import {
  InfluencerSocialPlatformDto,
  UpdateInfluencerDto,
} from './dto/update-influencer.dto';
import { InfluencerNotFoundException } from './exceptions/influencer.exception';
import { generateRelatedModelCRUDFactory } from 'src/utils/factories/generate-related-model-crud.factory';
import { StakeholderType } from './enums/stakeholder-type.enum';
import { InstagramService } from 'src/integrations/social/instagram/instagram.service';
import { StakeholdersService } from '../stakeholders/stakeholders.service';
import {
  SocialPlatformMissingDataException,
  SocialPlatformUnchangeableException,
} from './exceptions/social-platform.exception';
import { SocialPlatform } from '../stakeholders/enums/social-platform.enum';
import { Legal } from '../common/legals/enums/legal.enum';
import { SendEmailDto } from './dto/send-email.dto';
import {
  DiscoverInfluencerStage,
  DiscoverInfluencersFilterDto,
} from './dto/filters/discover-influencers-filter.dto';
import { InfluencersFilterDto } from './dto/filters/influencers-filter.dto';
import {
  DiseaseAreaTableResponseEntity,
  EthnicityTableResponseEntity,
  InfluencerTableResponseEntity,
  LabelTableResponseEntity,
  LocationTableResponseEntity,
  UserTableResponseEntity,
} from './entities/influencer-table-response.entity';
import { differenceInYears } from 'date-fns';
import { PostType } from './subroutes/desired-income/campaign/enums/post-type.enum';
import { SurveyType } from '../surveys/enums/survey-type.enum';
import { getPaginatedResults } from 'src/utils/prisma/get-paginated-result.util';
import { setEmptyToNull } from 'src/utils/formatters/empty-to-null.formatter';
import { setEmptyToUndefined } from 'src/utils/formatters/empty-to-undefined.formatter';
import { DeleteManyInfluencersDto } from './dto/delete-many-influencers.dto';
// import { InfluencerNotFoundException } from './exceptions/user.exception';
// import { InfluencerSurveyAmountService } from './influencer-survey-amount.service';
// import { InfluencerCampaignAmountService } from './influencer-campaign-amount.service';

@Injectable()
export class InfluencerService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly mailService: MailService,
    private readonly instagramService: InstagramService,
    private readonly stakeholderService: StakeholdersService,
  ) {}

  static queryInclude: Prisma.UserInclude = {
    influencer: {
      include: {
        invitedByUser: true,
        influencerSurveyAmounts: true,
        influencerCampaignAmounts: true,
        influencerDiseaseAreas: {
          include: {
            diseaseArea: true,
          },
        },
        platformProductOrderInfluencers: true,
        stakeholders: true,
      },
    },
    location: { include: { country: true } },
    assigneeUserLabels: true,
    notificationUsers: {
      include: { notification: { include: { notificationPayload: true } } },
    },
    productOrderChatRoomMember: { include: { productOrderChatRoom: true } },
  };

  async affiliateCodeOwner(affiliateCode: string) {
    return await this.prismaService.influencer.findFirstOrThrow({
      where: {
        affiliateCode,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async register(
    dto: InfluencerRegistrationDto,
    options?: { language: string },
  ) {
    try {
      const {
        firstName,
        lastName,
        email,
        password,
        commonLegalId,
        patientSpecificLegalId,
      } = dto;

      // check if legals are in place
      const commonLegalLast = await this.prismaService.legal.findFirstOrThrow({
        where: { type: Legal.Common },
        orderBy: { createdAt: 'desc' },
      });
      const patientSpecificLegalLast =
        await this.prismaService.legal.findFirstOrThrow({
          where: { type: Legal.PatientSpecific },
          orderBy: { createdAt: 'desc' },
        });

      /* if (commonLegalLast.id !== commonLegalId) {
        throw new BadRequestException(
          `Legal (${Legal.Common}) is not the newest`,
        );
      } else if (patientSpecificLegalLast.id !== patientSpecificLegalId) {
        throw new BadRequestException(
          `Legal (${Legal.Common}) is not the newest`,
        );
      } */

      const user = await this.prismaService.user.create({
        data: {
          firstName,
          lastName,
          email,
          password: await Hash(password),
          role: UserRole.Influencer,
          status: UserStatus.Unconfirmed,
          influencer: {
            create: {
              affiliateCode: generateAffiliateCode(),
            },
          },
          legalConsents: {
            createMany: {
              data: [
                {
                  legalId: commonLegalId,
                },
                {
                  legalId: patientSpecificLegalId,
                },
              ],
            },
          },
        },
        include: {
          influencer: true,
        },
      });

      await this.mailService.sendConfirmationEmail(
        user.id,
        user.email,
        user.role,
        user.firstName,
        options.language,
      );

      return user;
    } catch (error) {
      throwIfEmailExists(error);
      throw error;
    }
  }

  async registerViaInvitation(dto: InfluencerRegistrationViaInvitationDto) {
    try {
      const {
        firstName,
        lastName,
        email,
        password,
        commonLegalId,
        patientSpecificLegalId,
        affiliateCode,
      } = dto;

      // check if legals are in place
      const commonLegalLast = await this.prismaService.legal.findFirstOrThrow({
        where: { type: Legal.Common },
        orderBy: { createdAt: 'desc' },
      });
      const patientSpecificLegalLast =
        await this.prismaService.legal.findFirstOrThrow({
          where: { type: Legal.PatientSpecific },
          orderBy: { createdAt: 'desc' },
        });

      /* if (commonLegalLast.id !== commonLegalId) {
        throw new BadRequestException(
          `Legal (${Legal.Common}) is not the newest`,
        );
      } else if (patientSpecificLegalLast.id !== patientSpecificLegalId) {
        throw new BadRequestException(
          `Legal (${Legal.Common}) is not the newest`,
        );
      } */

      const [referrent, user] = await this.prismaService.$transaction(
        async (tx) => {
          const referredInfluencer = await tx.influencer.findFirstOrThrow({
            where: { affiliateCode: affiliateCode },
            include: {
              user: true,
            },
          });

          const createdUser = await tx.user.create({
            data: {
              email,
              firstName,
              lastName,
              password: await Hash(password),
              role: UserRole.Influencer,
              status: UserStatus.Unconfirmed,
              influencer: {
                create: {
                  // ! referredInfluencer can be undefined if affiliateCode is from ambassador
                  invitendByUserId: referredInfluencer?.user?.id,
                  affiliateCode: generateAffiliateCode(),
                },
              },
              legalConsents: {
                createMany: {
                  data: [
                    {
                      legalId: commonLegalId,
                    },
                    {
                      legalId: patientSpecificLegalId,
                    },
                  ],
                },
              },
            },
            include: {
              influencer: true,
            },
          });

          return [referredInfluencer, createdUser];
        },
      );

      await this.mailService.sendConfirmationEmail(
        user.id,
        user.email,
        user.role,
        user.firstName,
      );

      return user;
    } catch (error) {
      throwIfEmailExists(error);
      throw error;
    }
  }

  async findOne(
    id: number,
    includeDetailedInfo = true,
    includeAffiliates = false,
  ) {
    try {
      const queryInclude: Prisma.UserInclude = {
        ...InfluencerService.queryInclude,
        invitedInfluencers: includeAffiliates
          ? { include: { user: true } }
          : undefined,
      };

      const influencer = await this.prismaService.user.findFirstOrThrow({
        where: { id, isDeleted: false, role: UserRole.Influencer },
        include: queryInclude,
      });

      return influencer;
    } catch (error) {
      // * can throw PrismaClientKnownRequestError P2025
      if (error instanceof Prisma.NotFoundError) {
        throw new InfluencerNotFoundException({ id });
      }
      throw error;
    }
  }

  async filterDiscoverInfluencers(
    { skip, take }: PaginationParamsDto,
    filters: DiscoverInfluencersFilterDto,
  ) {
    const userStatuses = [];
    if (filters.status !== undefined) userStatuses.push(filters.status);
    if (filters.stage === DiscoverInfluencerStage.Registered)
      userStatuses.push(UserStatus.Unconfirmed, UserStatus.Confirmed);
    else if (filters.stage === DiscoverInfluencerStage.ToBeApproved)
      userStatuses.push(UserStatus.ToBeApproved);

    const userFilterQuery: Prisma.UserWhereInput = {
      OR: filters.search
        ? [
            { firstName: { contains: filters.search, mode: 'insensitive' } },
            { lastName: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ]
        : undefined,
      status: userStatuses.length ? { in: userStatuses } : undefined,
      isDeleted: false,
      location: {
        id: filters.locationIds?.length
          ? { in: filters.locationIds }
          : undefined,
        name: filters.search
          ? { contains: filters.search, mode: 'insensitive' }
          : undefined,
      },
      assigneeUserLabels: {
        ...(filters.hasLabel === true && { some: {} }),
        ...(filters.hasLabel === false && { none: {} }),
        ...(filters.labelIds?.length
          ? { some: { labelId: { in: filters.labelIds } } }
          : undefined),
      },
      calendarEventAttendees: {
        ...(filters.hasSchedule === true && { some: {} }),
        ...(filters.hasSchedule === false && { none: {} }),
        ...(filters.scheduleIds?.length
          ? {
              some: {
                calendarEvent: { eventType: { in: filters.scheduleIds } },
              },
            }
          : undefined),
      },
      createdAt: (filters.joinedFrom || filters.joinedTo) && {
        gte: filters.joinedFrom,
        lte: filters.joinedTo,
      },
    };
    const { minDOB, maxDOB } = calculateDOB(filters.ageMin, filters.ageMax);
    const influencerFilterQuery: Prisma.InfluencerWhereInput = {
      type: filters.experienceAs,
      ethnicityId: filters.ethnicityId,
      AND:
        minDOB || maxDOB || filters.gender
          ? [
              {
                // prioritize data that influencer has entered
                OR: [
                  {
                    dateOfBirth: {
                      gte: minDOB,
                      lte: maxDOB,
                    },
                  },
                  /* {
              stakeholders: (minDOB || maxDOB) && {
                some: {
                  dateOfBirth: {
                    gte: minDOB,
                    lte: maxDOB,
                  },
                },
              },
            }, */
                ],
              },
              {
                // if infleuncer didn't enter a data, take it from ML
                OR: [
                  {
                    gender: filters.gender,
                  },
                  /* {
              stakeholders: filters.gender && {
                some: {
                  gender: filters.gender,
                },
              },
            }, */
                ],
              },
            ]
          : undefined,
    };
    const stakeholderFilterQuery: Prisma.StakeholderWhereInput = {
      patientCaregiverDiseaseAreas: filters.diseaseAreaIds?.length
        ? {
            some: {
              diseaseAreaId: {
                in: filters.diseaseAreaIds,
              },
            },
          }
        : undefined,
      // dateOfBirth: {
      //   gte: minDOB,
      //   lte: maxDOB,
      // },
      // gender: filters.gender,
      socialPlatformId: filters.socialMediaId
        ? { in: filters.socialMediaId }
        : undefined,
      socialPlatformUsername: filters.search
        ? { contains: filters.search }
        : undefined,
    };

    const influencers =
      await getPaginatedResults<Prisma.InfluencerFindManyArgs>(
        this.prismaService,
        Prisma.ModelName.Influencer,
        {
          where: {
            ...influencerFilterQuery,
            user: {
              ...userFilterQuery,
            },
            OR: [
              {
                stakeholders: {
                  some: {
                    ...stakeholderFilterQuery,
                  },
                },
              },
              {
                stakeholders: {
                  none: {},
                },
              },
            ],
          },
          select: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                status: true,
                currency: true,
                createdAt: true,
                updatedAt: true,
                assigneeUserLabels: {
                  select: {
                    label: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
                location: {
                  select: {
                    id: true,
                    name: true,
                    country: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
            invitedByUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            gender: true,
            dateOfBirth: true,
            influencerCampaignAmounts: {
              select: {
                _count: true,
                desiredAmount: true,
                postType: true,
              },
            },
            influencerSurveyAmounts: {
              select: {
                _count: true,
                desiredAmount: true,
                surveyType: true,
              },
            },
            influencerDiseaseAreas: {
              select: {
                id: true,
                diseaseAreaId: true,
                diseaseArea: {
                  select: {
                    id: true,
                    name: true,
                    parentDiseaseArea: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
            stakeholders: {
              select: {
                patientCaregiverDiseaseAreas: {
                  select: {
                    diseaseArea: {
                      select: {
                        id: true,
                        name: true,
                        parentDiseaseArea: {
                          select: {
                            id: true,
                            name: true,
                          },
                        },
                      },
                    },
                  },
                },
                gender: true,
                dateOfBirth: true,
                socialPlatform: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        { skip, limit: take },
      );

    const mappedInfluencers = influencers.data.map((influencer) => {
      return {
        id: influencer.user.id,
        ...influencer,
      };
    });

    return { data: mappedInfluencers, pagination: influencers.pagination };
  }

  async filterInfluencers(
    { skip, take }: PaginationParamsDto,
    filters: InfluencersFilterDto,
  ) {
    const userFilterQuery: Prisma.UserWhereInput = {
      status: UserStatus.Approved,
      isDeleted: false,
      location: {
        id: filters.locationIds?.length
          ? { in: filters.locationIds }
          : undefined,
      },
      assigneeUserLabels: {
        ...(filters.hasLabel === true && { some: {} }),
        ...(filters.hasLabel === false && { none: {} }),
        ...(filters.labelIds?.length
          ? { some: { labelId: { in: filters.labelIds } } }
          : undefined),
      },
      calendarEventAttendees: {
        ...(filters.hasSchedule === true && { some: {} }),
        ...(filters.hasSchedule === false && { none: {} }),
        ...(filters.scheduleIds?.length
          ? {
              some: {
                calendarEvent: { eventType: { in: filters.scheduleIds } },
              },
            }
          : undefined),
      },
      createdAt: (filters.joinedFrom || filters.joinedTo) && {
        gte: filters.joinedFrom,
        lte: filters.joinedTo,
      },
    };
    const { minDOB, maxDOB } = calculateDOB(filters.ageMin, filters.ageMax);
    const influencerFilterQuery: Prisma.InfluencerWhereInput = {
      type: filters.experienceAs,
      ethnicityId: filters.ethnicityId,
      //#region should be in selected by influencer-entered data, then by scraped social platform data
      dateOfBirth: (minDOB || maxDOB) && {
        gte: minDOB,
        lte: maxDOB,
      },
      gender: filters.gender,
      //#endregion
      // OR: [
      //   // * prioritize data that influencer has entered
      //   // take a data that influencer has entered
      //   {
      //     dateOfBirth: (minDOB || maxDOB) && {
      //       gte: minDOB,
      //       lte: maxDOB,
      //     },
      //     gender: filters.gender,
      //   },
      //   // TODO uncomment when non-bugged solution is found
      //   /* // from influencer, try to take DoB
      //   {
      //     dateOfBirth: (minDOB || maxDOB) && {
      //       gte: minDOB,
      //       lte: maxDOB,
      //     },
      //     stakeholders: filters.gender && {
      //       some: {
      //         gender: filters.gender,
      //       },
      //     },
      //   },
      //   // from influencer, try to take gender
      //   {
      //     stakeholders: (minDOB || maxDOB) && {
      //       some: {
      //         dateOfBirth: {
      //           gte: minDOB,
      //           lte: maxDOB,
      //         },
      //       },
      //     },
      //     gender: filters.gender,
      //   },
      //   // as influencer did not entered DoB nor gender, see his social platforms (scraped)
      //   {
      //     stakeholders: (minDOB || maxDOB || filters.gender) && {
      //       some: {
      //         dateOfBirth: (minDOB || maxDOB) && {
      //           gte: minDOB,
      //           lte: maxDOB,
      //         },
      //         gender: filters.gender,
      //       },
      //     },
      //   }, */
      // ],
    };
    const stakeholderFilterQuery: Prisma.StakeholderWhereInput = {
      patientCaregiverDiseaseAreas: filters.diseaseAreaIds?.length
        ? { some: { diseaseAreaId: { in: filters.diseaseAreaIds } } }
        : undefined,
      // dateOfBirth: {
      //   gte: minDOB,
      //   lte: maxDOB,
      // },
      // gender: filters.gender,
      socialPlatformId:
        filters.socialMediaId !== undefined
          ? { in: filters.socialMediaId }
          : undefined,
      followersCount: (filters.followersMin || filters.followersMax) && {
        gte: filters.followersMin,
        lte: filters.followersMax,
      },
    };
    const isAnyStakeholderFilterActive =
      filters.diseaseAreaIds?.length ||
      filters.socialMediaId !== undefined ||
      filters.followersMin !== undefined ||
      filters.followersMax !== undefined;
    // influencerSearchFilterQuery
    /* const influencerSearchFilterQuery: Prisma.InfluencerWhereInput = {
      OR: filters.search
        ? [
            {
              user: {
                OR: [
                  {
                    firstName: {
                      contains: filters.search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    lastName: { contains: filters.search, mode: 'insensitive' },
                  },
                  {
                    email: { contains: filters.search, mode: 'insensitive' },
                  },
                  {
                    location: {
                      name: { contains: filters.search, mode: 'insensitive' },
                    },
                  },
                ],
              },
            },
            {
              stakeholders: {
                some: {
                  socialPlatformUsername: filters.search
                    ? { contains: filters.search, mode: 'insensitive' }
                    : undefined,
                },
              },
            },
          ]
        : undefined,
    }; */
    const whereQuery: Prisma.InfluencerWhereInput = {
      OR: filters.search
        ? [
            {
              user: {
                OR: [
                  {
                    firstName: {
                      contains: filters.search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    lastName: { contains: filters.search, mode: 'insensitive' },
                  },
                  {
                    email: { contains: filters.search, mode: 'insensitive' },
                  },
                  {
                    location: {
                      name: { contains: filters.search, mode: 'insensitive' },
                    },
                  },
                ],
                ...userFilterQuery,
              },
              OR: [
                // if stakeholders: { some: { ... } } is not true, result is positive only
                // if stakeholders { none: {} } is true with condition stakeholder filter is off
                {
                  stakeholders: {
                    some: {
                      ...stakeholderFilterQuery,
                    },
                  },
                },
                {
                  stakeholders: !isAnyStakeholderFilterActive
                    ? {
                        none: {},
                      }
                    : undefined,
                },
              ],
              ...influencerFilterQuery,
            },
            {
              stakeholders: {
                some: {
                  socialPlatformUsername: filters.search
                    ? { contains: filters.search, mode: 'insensitive' }
                    : undefined,
                  ...stakeholderFilterQuery,
                },
              },
              user: {
                ...userFilterQuery,
              },
              ...influencerFilterQuery,
            },
          ]
        : undefined,
      ...(!filters.search && {
        ...influencerFilterQuery,
        user: {
          ...userFilterQuery,
        },
        OR: [
          // if stakeholders: { some: { ... } } is not true, result is positive only
          // if stakeholders { none: {} } is true with condition stakeholder filter is off
          {
            stakeholders: {
              some: {
                ...stakeholderFilterQuery,
              },
            },
          },
          {
            stakeholders: !isAnyStakeholderFilterActive
              ? {
                  none: {},
                }
              : undefined,
          },
        ],
      }),
    };

    const influencers = await getPaginatedResults<
      Prisma.InfluencerFindManyArgs,
      Influencer & {
        user: User & {
          assigneeUserLabels: (UserLabel & { label: Label })[];
          location: Location & { country: Location };
          invitedInfluencers: (Influencer & { user: User })[];
        };
        stakeholders: (Stakeholder & {
          socialPlatform: SocialPlatformModel;
          patientCaregiverDiseaseAreas: (PatientCaregiverDiseaseArea & {
            diseaseArea: DiseaseArea & {
              parentDiseaseArea: DiseaseArea;
            };
          })[];
        })[];
        invitedByUser: User;
        ethnicity: Ethnicity;
        influencerCampaignAmounts: InfluencerCampaignAmount[];
        influencerSurveyAmounts: InfluencerSurveyAmount[];
        influencerDiseaseAreas: {
          id: number;
          diseaseAreaId: number;
          diseaseArea: DiseaseArea & {
            parentDiseaseArea: DiseaseArea;
          };
        }[];
      }
    >(
      this.prismaService,
      Prisma.ModelName.Influencer,
      {
        where: {
          ...whereQuery,
          /* ...influencerSearchFilterQuery,
          ...influencerFilterQuery,
          user: {
            ...userFilterQuery,
          },
          OR: [
            {
              stakeholders: {
                some: {
                  ...stakeholderFilterQuery,
                },
              },
            },
            {
              stakeholders: !isAnyStakeholderFilterActive
                ? {
                    none: {},
                  }
                : undefined,
            },
          ], */
        },

        select: {
          id: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              status: true,
              currency: true,
              createdAt: true,
              updatedAt: true,
              assigneeUserLabels: {
                select: {
                  label: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
              location: {
                select: {
                  id: true,
                  name: true,
                  country: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
              invitedInfluencers: {
                select: {
                  id: true,
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                      status: true,
                    },
                  },
                },
              },
            },
          },
          invitedByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          gender: true,
          dateOfBirth: true,
          influencerCampaignAmounts: {
            select: {
              _count: true,
              desiredAmount: true,
              postType: true,
            },
          },
          influencerSurveyAmounts: {
            select: {
              _count: true,
              desiredAmount: true,
              surveyType: true,
            },
          },
          influencerDiseaseAreas: {
            select: {
              id: true,
              diseaseAreaId: true,
              diseaseArea: {
                select: {
                  id: true,
                  name: true,
                  parentDiseaseArea: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },

          type: true,
          ethnicity: {
            select: {
              id: true,
              name: true,
            },
          },
          stakeholders: {
            select: {
              patientCaregiverDiseaseAreas: {
                select: {
                  diseaseArea: {
                    select: {
                      id: true,
                      name: true,
                      parentDiseaseArea: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
              gender: true,
              dateOfBirth: true,
              socialPlatform: {
                select: {
                  id: true,
                  name: true,
                },
              },
              socialPlatformUsername: true,
              followersCount: true,
            },
          },
        },
      },
      { skip, limit: take },
    );

    const currentDate = new Date();

    const result = influencers.data
      .map((influencer) => {
        const influencerPerSocialPlatforms: InfluencerTableResponseEntity[] =
          [];

        if (influencer.stakeholders?.length) {
          for (const stakeholder of influencer.stakeholders) {
            const tableInfluencer = new InfluencerTableResponseEntity({
              id: influencer.user.id,
              influencerId: influencer.id,
              user: {
                id: influencer.user.id,
                firstName: influencer.user.firstName,
                lastName: influencer.user.lastName,
                email: influencer.user.email,
                age: influencer.dateOfBirth
                  ? differenceInYears(currentDate, influencer.dateOfBirth)
                  : stakeholder.dateOfBirth &&
                    differenceInYears(currentDate, stakeholder.dateOfBirth),
                gender: influencer.gender || stakeholder.gender,
              },
              experienceAs: influencer.type,
              socialMedia: stakeholder.socialPlatform.id - 1, // TODO fix (make enum instead!)
              username: stakeholder.socialPlatformUsername,
              diseaseAreas: influencer.influencerDiseaseAreas.map(
                (diseaseArea) => {
                  return new DiseaseAreaTableResponseEntity({
                    id: diseaseArea.diseaseAreaId,
                    name: diseaseArea.diseaseArea.name,
                    parentDiseaseArea: new DiseaseAreaTableResponseEntity(
                      diseaseArea.diseaseArea.parentDiseaseArea,
                    ),
                  });
                },
              ),
              location: influencer.user.location
                ? new LocationTableResponseEntity({
                    id: influencer.user.location.id,
                    name: influencer.user.location.name,
                    country:
                      influencer.user.location.country &&
                      new LocationTableResponseEntity(
                        influencer.user.location.country,
                      ),
                  })
                : undefined,
              invitedBy: new UserTableResponseEntity(influencer.invitedByUser),
              invited: influencer.user.invitedInfluencers
                .filter(
                  (invitedInfluencer) =>
                    invitedInfluencer.user.status > UserStatus.Unconfirmed,
                )
                .map(
                  (invitedInfluencer) =>
                    new UserTableResponseEntity(invitedInfluencer.user),
                ),
              ethnicity: new EthnicityTableResponseEntity(influencer.ethnicity),
              followers: stakeholder.followersCount,
              labels: influencer.user.assigneeUserLabels.map(
                (label) => new LabelTableResponseEntity(label.label),
              ),
              registeredAt: influencer.user.createdAt,
              postAmount: influencer.influencerCampaignAmounts
                .find(
                  (desiredAmountSetting) =>
                    desiredAmountSetting.postType === PostType.Post,
                )
                ?.desiredAmount.toNumber(),
              reelAmount: influencer.influencerCampaignAmounts
                .find(
                  (desiredAmountSetting) =>
                    desiredAmountSetting.postType === PostType.Reel,
                )
                ?.desiredAmount.toNumber(),
              storyAmount: influencer.influencerCampaignAmounts
                .find(
                  (desiredAmountSetting) =>
                    desiredAmountSetting.postType === PostType.Story,
                )
                ?.desiredAmount.toNumber(),
              questionCreditAmount: influencer.influencerSurveyAmounts
                .find(
                  (desiredAmountSetting) =>
                    desiredAmountSetting.surveyType ===
                    SurveyType.Questionnaire,
                )
                ?.desiredAmount.toNumber(),
              shortInterviewAmount: influencer.influencerSurveyAmounts
                .find(
                  (desiredAmountSetting) =>
                    desiredAmountSetting.surveyType ===
                    SurveyType.Short_Interview,
                )
                ?.desiredAmount.toNumber(),
              longInterviewAmount: influencer.influencerSurveyAmounts
                .find(
                  (desiredAmountSetting) =>
                    desiredAmountSetting.surveyType ===
                    SurveyType.Long_Interview,
                )
                ?.desiredAmount.toNumber(),
            });

            influencerPerSocialPlatforms.push(tableInfluencer);
          }
        } else {
          const tableInfluencer = new InfluencerTableResponseEntity({
            user: {
              id: influencer.user.id,
              firstName: influencer.user.firstName,
              lastName: influencer.user.lastName,
              email: influencer.user.email,
              age:
                influencer.dateOfBirth &&
                differenceInYears(currentDate, influencer.dateOfBirth),
              gender: influencer.gender,
            },
            id: influencer.user.id,
            influencerId: influencer.id,
            experienceAs: influencer.type,
            socialMedia: null,
            username: null,
            diseaseAreas: influencer.influencerDiseaseAreas.map(
              (diseaseArea) => {
                return new DiseaseAreaTableResponseEntity({
                  id: diseaseArea.diseaseAreaId,
                  name: diseaseArea.diseaseArea.name,
                  parentDiseaseArea: new DiseaseAreaTableResponseEntity(
                    diseaseArea.diseaseArea.parentDiseaseArea,
                  ),
                });
              },
            ),
            location: influencer.user.location
              ? new LocationTableResponseEntity({
                  id: influencer.user.location.id,
                  name: influencer.user.location.name,
                  country:
                    influencer.user.location.country &&
                    new LocationTableResponseEntity(
                      influencer.user.location.country,
                    ),
                })
              : undefined,
            invitedBy: new UserTableResponseEntity(influencer.invitedByUser),
            invited: influencer.user.invitedInfluencers
              .filter(
                (invitedInfluencer) =>
                  invitedInfluencer.user.status > UserStatus.Unconfirmed,
              )
              .map(
                (invitedInfluencer) =>
                  new UserTableResponseEntity(invitedInfluencer.user),
              ),
            ethnicity: new EthnicityTableResponseEntity(influencer.ethnicity),
            followers: null,
            labels: influencer.user.assigneeUserLabels.map(
              (label) => new LabelTableResponseEntity(label.label),
            ),
            registeredAt: influencer.user.createdAt,
            postAmount: influencer.influencerCampaignAmounts
              .find(
                (desiredAmountSetting) =>
                  desiredAmountSetting.postType === PostType.Post,
              )
              ?.desiredAmount.toNumber(),
            reelAmount: influencer.influencerCampaignAmounts
              .find(
                (desiredAmountSetting) =>
                  desiredAmountSetting.postType === PostType.Reel,
              )
              ?.desiredAmount.toNumber(),
            storyAmount: influencer.influencerCampaignAmounts
              .find(
                (desiredAmountSetting) =>
                  desiredAmountSetting.postType === PostType.Story,
              )
              ?.desiredAmount.toNumber(),
            questionCreditAmount: influencer.influencerSurveyAmounts
              .find(
                (desiredAmountSetting) =>
                  desiredAmountSetting.surveyType === SurveyType.Questionnaire,
              )
              ?.desiredAmount.toNumber(),
            shortInterviewAmount: influencer.influencerSurveyAmounts
              .find(
                (desiredAmountSetting) =>
                  desiredAmountSetting.surveyType ===
                  SurveyType.Short_Interview,
              )
              ?.desiredAmount.toNumber(),
            longInterviewAmount: influencer.influencerSurveyAmounts
              .find(
                (desiredAmountSetting) =>
                  desiredAmountSetting.surveyType === SurveyType.Long_Interview,
              )
              ?.desiredAmount.toNumber(),
          });

          // add an user as if he has 1 social platform
          influencerPerSocialPlatforms.push(tableInfluencer);
        }

        return influencerPerSocialPlatforms.map((inf) => {
          Object.keys(inf).forEach(
            (value) => (inf[value] = setEmptyToUndefined(inf[value])),
          );
          return inf;
        });
      })
      .flat();

    influencers.data = null;
    influencers.dataFormatted = result;
    influencers.pagination.itemCountReal = result.length;

    return influencers;
  }

  async findAll(
    { skip, take }: PaginationParamsDto,
    { includeDeleted = false }: FilterParamsDto,
  ): Promise<PaginationResult<User>> {
    const queryWhere: Prisma.UserWhereInput = { role: UserRole.Influencer };
    if (!includeDeleted) queryWhere.isDeleted = false;
    const queryInclude: Prisma.UserInclude = {
      influencer: { include: { invitedByUser: true } },
    };
    // ! queryOrderBy is WIP
    const queryOrderBy: Prisma.Enumerable<Prisma.UserOrderByWithRelationInput> =
      undefined;

    try {
      const result = await filterRecordsFactory(
        this.prismaService,
        (tx) => tx.user,
        {
          where: queryWhere,
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

  async deleteOne(id: number) {
    try {
      const user = await this.prismaService.user.update({
        where: { id },
        data: { isDeleted: true },
      });

      const deletedUserId = user.id;

      await this.prismaService.influencer.updateMany({
        where: {
          invitendByUserId: {
            in: deletedUserId,
          },
        },
        data: {
          invitendByUserId: null,
        },
      });

      return user;
    } catch (error) {
      // * can throw PrismaClientKnownRequestError P2025
      throw error;
    }
  }

  async deleteMany(dto: DeleteManyInfluencersDto) {
    const { userIds } = dto;
    try {
      const existingUsers = await this.prismaService.user.findMany({
        where: {
          id: { in: userIds },
        },
        select: {
          id: true,
        },
      });

      const existingUserIds = existingUsers.map((user) => user.id);
      const missingUserIds = userIds.filter(
        (userId) => !existingUserIds.includes(userId),
      );

      if (missingUserIds.length > 0) {
        throw new NotFoundException(
          `Users with IDs ${missingUserIds.join(', ')} not found.`,
        );
      }

      const updatedUsers = await this.prismaService.user.updateMany({
        where: {
          id: {
            in: userIds,
          },
        },
        data: {
          isDeleted: true,
        },
      });

      await this.prismaService.influencer.updateMany({
        where: {
          invitendByUserId: {
            in: userIds,
          },
        },
        data: {
          invitendByUserId: null,
        },
      });

      return updatedUsers;
    } catch (error) {
      throw error;
    }
  }

  async update(id: number, updateInfluencerDto: UpdateInfluencerDto) {
    // check if influencer exists
    const userInfluencer = await this.findOne(id);

    const {
      firstName,
      lastName,
      email,
      password,
      locationId,
      currency,
      gender,
      dateOfBirth,
      ethnicityId,
      type,
      diseaseAreas,
      // socialPlatforms,
      campaignDesiredIncome,
      surveyDesiredIncome,
      status,
    } = updateInfluencerDto;

    // constexistingSocialPlatforms = await this.getSocialPlatforms(id);
    // const existingSocialPlatforms = [];

    const socialPlatformsWithVendorId: Array<{
      socialPlatformId: number;
      socialPlatformUserId: string | number;
      // ? iv?: string;
    }> = [];

    // Temporary set social platform to empty
    // existingSocialPlatforms = [];

    // for every existing social platform there has to be the same social platform in the new data (HTTP PUT)
    // if (
    //   existingSocialPlatforms &&
    //   !existingSocialPlatforms.every((existingSocialPlatform) =>
    //     socialPlatforms.some(
    //       (socialPlatform) =>
    //         socialPlatform.socialPlatformId ===
    //         existingSocialPlatform.socialPlatformId,
    //     ),
    //   )
    // ) {
    //   throw new SocialPlatformUnchangeableException(
    //     `Can't de-sync any social network: Please contact the support if you decide to de-sync your social network account`,
    //   );
    // }

    // for (const socialPlatform of socialPlatforms) {
    //   // if authorization code is in the body, use it
    //   if (socialPlatform.authorizationCode !== undefined) {
    //     const { userId: vendorId } =
    //       await this.instagramService.exchangeCodeForAccessToken(
    //         socialPlatform.authorizationCode,
    //         false,
    //       );

    //     // check if social platform is registered, but user tried to swap its existing platform ID (account swap)
    //     if (
    //       existingSocialPlatforms.some(
    //         (existingSocialPlatform) =>
    //           existingSocialPlatform.socialPlatformId ===
    //             socialPlatform.socialPlatformId &&
    //           existingSocialPlatform.socialPlatformUserId !==
    //             vendorId.toString(),
    //       )
    //     ) {
    //       // TODO return international response
    //       throw new SocialPlatformUnchangeableException(
    //         `Can't update social network (${socialPlatform.socialPlatformId}) that was previously synced: Please contact the support if you decide to switch an account`,
    //       );
    //     }

    //     // create/update
    //     socialPlatformsWithVendorId.push({
    //       socialPlatformId: socialPlatform.socialPlatformId,
    //       socialPlatformUserId: vendorId,
    //     });
    //   } else {
    //     if (
    //       !existingSocialPlatforms.some(
    //         (existingSocialPlatform) =>
    //           existingSocialPlatform.socialPlatformId ===
    //           socialPlatform.socialPlatformId,
    //       )
    //     ) {
    //       throw new SocialPlatformMissingDataException(
    //         `Can't connect to social network (${socialPlatform.socialPlatformId}): Authorization code missing`,
    //       );
    //     }

    //     socialPlatformsWithVendorId.push({
    //       socialPlatformId: socialPlatform.socialPlatformId,
    //       socialPlatformUserId: existingSocialPlatforms.find(
    //         (existingSocialPlatform) =>
    //           existingSocialPlatform.socialPlatformId ===
    //           socialPlatform.socialPlatformId,
    //       ).socialPlatformUserId,
    //     });
    //   }
    // }

    return await this.prismaService.user.update({
      where: { id },
      data: {
        firstName,
        lastName,
        email,
        password: password !== undefined ? await Hash(password) : undefined,
        locationId,
        currency,
        status,
        influencer: {
          update: {
            gender,
            dateOfBirth,
            ethnicityId,
            type,
            //#region update the tables related to influencer by overriding existing data
            influencerDiseaseAreas: generateRelatedModelCRUDFactory<
              InfluencerDiseaseArea,
              Prisma.InfluencerDiseaseAreaWhereUniqueInput
            >()(
              diseaseAreas,
              {
                id: userInfluencer.influencer.id,
                foreignKey: 'influencerId',
              },
              [{ id: (obj) => obj, foreignKey: 'diseaseAreaId' }],
              'InfluencerDiseaseAreaIdentifier',
            ),
            // stakeholders: generateRelatedModelCRUDFactory<
            //   Stakeholder,
            //   Prisma.StakeholderWhereUniqueInput
            // >()(
            //   // socialPlatforms,
            //   socialPlatformsWithVendorId,
            //   {
            //     id: userInfluencer.influencer.id,
            //     foreignKey: 'influencerId',
            //   },
            //   [
            //     {
            //       id: (obj) => obj.socialPlatformId,
            //       foreignKey: 'socialPlatformId',
            //     },
            //   ],
            //   'InfluencerStakeholderIdentifier',
            //   (obj) => ({
            //     socialPlatformId: obj.socialPlatformId,
            //     // TODO socialPlatformUserId: obj.vendorId,
            //     socialPlatformUserId: obj.socialPlatformUserId.toString(),
            //     type: StakeholderType.RegisteredPatient,
            //     isRegistered: true,
            //   }),
            // ),
            influencerCampaignAmounts: generateRelatedModelCRUDFactory<
              InfluencerCampaignAmount,
              Prisma.InfluencerCampaignAmountWhereUniqueInput
            >()(
              campaignDesiredIncome,
              {
                id: userInfluencer.influencer.id,
                foreignKey: 'influencerId',
              },
              [{ id: (obj) => obj.postType, foreignKey: 'postType' }],
              'InfluencerCampaignAmountIdentifier',
            ),
            influencerSurveyAmounts: generateRelatedModelCRUDFactory<
              InfluencerSurveyAmount,
              Prisma.InfluencerSurveyAmountWhereUniqueInput
            >()(
              surveyDesiredIncome,
              {
                id: userInfluencer.influencer.id,
                foreignKey: 'influencerId',
              },
              [{ id: (obj) => obj.surveyType, foreignKey: 'surveyType' }],
              'InfluencerSurveyAmountIdentifier',
            ),
            //#endregion
          },
        },
      },
      include: InfluencerService.queryInclude,
    });
  }

  private async getSocialPlatforms(id: number) {
    const stakeholders = await this.stakeholderService.find({
      influencer: { userId: id },
    });
    const socialPlatforms = stakeholders.map((stakeholder) => ({
      socialPlatformId: stakeholder.socialPlatformId,
      socialPlatformUserId: stakeholder.socialPlatformUserId,
    }));

    return socialPlatforms;
  }

  async verifyByUserId(id: number) {
    return await this.prismaService.$transaction(async (tx) => {
      await tx.user.findFirstOrThrow({
        where: {
          id,
          role: UserRole.Influencer,
          firstName: { not: null },
          lastName: { not: null },
          email: { not: null },
          password: { not: null },
          location: { isNot: null },
          currency: { not: null },
          influencer: {
            dateOfBirth: { not: null },
            gender: { not: null },
            ethnicity: { isNot: null },
            type: { not: null },
            influencerDiseaseAreas: { some: {} },
            stakeholders: {
              // some: { socialPlatformId: SocialPlatform.Instagram },
              // * at least one social platform
              some: {},
            },
            influencerSurveyAmounts: { some: {} },
            influencerCampaignAmounts: {
              some: {},
            },
          },
        },
      });

      return await this.prismaService.user.update({
        where: { id },
        data: {
          status: UserStatus.Approved,
        },
      });
    });
  }

  async sendEmail(userId: number, { content }: SendEmailDto) {
    // user influencer
    const user = await this.prismaService.user.findUniqueOrThrow({
      where: { id: userId },
    });

    await this.mailService.sendEmptyInfluencer(
      user.email,
      user.firstName,
      content,
    );
  }
}
