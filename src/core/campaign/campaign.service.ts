import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CampaignFiltersDto,
  CampaignSimpleFiltersDto,
  ClientSimpleFiltersDto,
  CreateCampaignDto,
  OrderReportDto,
  SubmitInfluencerDataDto,
  TargetSimpleFiltersDto,
  UpdateCampaignDto,
} from './dto';
import { PrismaService } from 'src/integrations/prisma/prisma.service';
import { PlatformProductOrderService } from '../platform-product/platform-product-order.service';
import { PlatformProduct } from '../platform-product/enums/platform-product.enum';
import {
  CampaignInfluencerPerformance,
  Prisma,
  Product,
  User,
} from '@prisma/client';
import { UserRole } from 'src/utils';
import { ambassadorCommission } from 'src/config';
import { ReportType, Status } from './enums';
import {
  ApplicationException,
  BadRequestApplicationException,
  ForbiddenApplicationException,
  NotFoundApplicationException,
} from 'src/exceptions/application.exception';
import { JwtService } from '@nestjs/jwt';
import { FilterParamsDto } from 'src/utils/object-definitions/dtos/filter-params.dto';
import { filterRecordsFactory } from 'src/utils/factories/filter-records.factory';
import { ProductOrderInfluencerStatus } from '../platform-product/enums/product-order-influencer-status.enum';
import { UserWithInfluencer } from '../influencer/types';
import { userIdentity } from '../users/utils/user-identity';
import { idToPseudostring } from './utils/website-link-generator';
import { Decimal } from '@prisma/client/runtime';
import { CampaignFilterDto } from './dto/campaign--filter.dto';
import { UserEntity } from '../users/entities/user.entity';
import { CampaignReportFilterDto } from './dto/campaign-report-filter.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DeleteManyCampaignsDto } from './dto/delete-many-campaigns.dto';
import { DeleteManyCampaignReportsDto } from './dto/delete-many-campaign-reports.dto';
import { FinanceStatus } from './enums/finance-status.enum';
import { CampaignInviteInfluencers } from './dto/campaing-invite-influencers.dto';

@Injectable()
export class CampaignService {
  private readonly campaignQueryIncludeSingle: Prisma.CampaignInclude = {
    campaignInfluencersSizes: {
      select: {
        influencerSize: true,
        influencerSizeId: true,
      },
    },
    products: {
      select: {
        product: true,
      },
    },
    exampleImages: true,
    stakeholderTypes: {
      select: {
        stakeholderType: true,
      },
    },
    platformProductOrder: {
      include: {
        client: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            company: true,
            ambassador: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        currency: {
          select: {
            id: true,
            code: true,
          },
        },
        platformProductOrderDiseaseAreas: {
          select: {
            diseaseArea: true,
          },
          orderBy: {
            diseaseArea: {
              name: 'asc',
            },
          },
        },
        platformProductOrderEthnicities: {
          select: {
            ethnicity: true,
          },
          orderBy: {
            ethnicity: {
              name: 'asc',
            },
          },
        },
        platformProductOrderGenders: {
          select: {
            gender: true,
          },
        },
        platformProductOrderLanguages: {
          select: {
            language: true,
          },
        },
        platformProductOrderInterests: {
          select: {
            interest: true,
          },
          orderBy: {
            interest: {
              name: 'asc',
            },
          },
        },
        // markets
        platformProductOrderLocations: {
          select: {
            location: {
              include: {
                country: true,
              },
            },
          },
          orderBy: {
            location: {
              name: 'asc',
            },
          },
        },
        platformProductOrderStruggles: {
          select: {
            struggle: true,
          },
          orderBy: {
            struggle: {
              name: 'asc',
            },
          },
        },
        platformProductOrderSymptoms: {
          select: {
            symptom: true,
          },
          orderBy: {
            symptom: {
              name: 'asc',
            },
          },
        },
        platformProductOrderLabels: {
          select: {
            label: true,
          },
          orderBy: {
            label: {
              name: 'asc',
            },
          },
        },
        // platformProductOrderInfluencers: true,
        platformProductOrderInfluencers: {
          include: {
            influencer: {
              select: { stakeholders: true, user: true },
            },
          },
        },
      },
    },
  };
  private readonly campaignQueryIncludeMany: Prisma.CampaignInclude = {
    campaignInfluencersSizes: true,
    products: {
      select: {
        product: true,
      },
    },

    platformProductOrder: {
      include: {
        client: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        platformProductOrderDiseaseAreas: {
          select: {
            diseaseArea: true,
          },
        },
        // markets
        platformProductOrderLocations: {
          select: {
            location: {
              include: {
                country: true,
              },
            },
          },
        },
        // OLD // for count purposes get all influencers, but not their details
        // OLD platformProductOrderInfluencers: true,
        platformProductOrderInfluencers: {
          include: {
            influencer: true,
          },
        },
      },
    },
  };
  private readonly campaignInfluencersQueryInclude: Prisma.PlatformProductOrderInfluencerInclude =
    {
      influencer: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    };

  constructor(
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly productOrdersService: PlatformProductOrderService,
    private readonly jwtService: JwtService,
  ) {}

  async create(createCampaignDto: CreateCampaignDto, user: UserEntity) {
    const {
      name,
      clientId,
      budget,
      currencyId,
      diseaseAreaIds,
      stakeholderTypes,
      struggleIds,
      symptomIds,
      locationIds,
      languages,
      ethnicityIds,
      interestIds,
      productIds,
      dateStart,
      dateEnd,
      description,
      influencersCount,
      influencersSizeIds,
      ageMin,
      ageMax,
      genders,
      targetAudienceDescription,
      socialPlatformId,
      postType,
      exampleImageUrls,
      clientCompanyWebsite,
      instructions,
      report,
    } = createCampaignDto;

    const campaign = await this.prismaService.$transaction(async (tx) => {
      const productNames = productIds.filter(
        (item) => typeof item === 'string',
      );
      const productNumbers = productIds.filter(
        (item) => typeof item === 'number',
      );

      const newProducts = [];

      if (productNames.length > 0) {
        const userPromise = clientId
          ? this.prismaService.user.findFirstOrThrow({
              where: {
                id: clientId,
              },
              select: {
                client: {
                  select: {
                    id: true,
                  },
                },
              },
            })
          : Promise.resolve(null);

        const clientUser = await userPromise;

        for (let i = 0; i < productNames.length; i++) {
          const createdByClientId = clientUser?.client.id ?? user.client.id;

          const newProduct = await this.prismaService.product.create({
            data: {
              name: productNames[i].toString(),
              isApproved: false,
              createdByClientId,
            },
          });

          if (newProduct) {
            newProducts.push(newProduct.id);
          }
        }
      }

      const finalProductsIds = [...productNumbers, ...newProducts];

      const campaign = await this.prismaService.campaign.create({
        data: {
          name,
          stakeholderTypes: stakeholderTypes && {
            createMany: {
              data: stakeholderTypes.map((stakeholderType) => ({
                stakeholderType,
              })),
            },
          },
          products: finalProductsIds && {
            createMany: {
              data: finalProductsIds.map((productId) => ({ productId })),
            },
          },
          dateStart,
          dateEnd,
          description,
          influencersCount,
          // influencersSizeId,
          campaignInfluencersSizes: influencersSizeIds && {
            createMany: {
              data: influencersSizeIds.map((influencerSizeId) => ({
                influencerSizeId,
              })),
            },
          },
          ageMin,
          ageMax,
          targetAudienceDescription,
          socialPlatformId,
          postType,
          exampleImages: exampleImageUrls && {
            createMany: {
              data: exampleImageUrls.map((imageUrl) => ({ imageUrl })),
            },
          },
          clientCompanyWebsite,
          instructions,
          report,
          // contract,
          // isContractApproved: false,
          /* campaignInfluencersSizes: {
            create: { influencerSizeId: influencersSizeId },
          }, */ // TODO remove from ER diagram
          // ? language: languageId, // ! this is wrong, review ER diagram
          // productId,
          // TODO campaignReport at later stage if report = true,
          platformProductOrder: {
            create: {
              // TODO remove platformProduct,
              // ! do not pull platform product id from the database, it's a simple setting
              platformProduct: PlatformProduct.Campaign,
              // TODO remove client,
              // * just in case, check if logged-in user is a client, and use it instead of clientId property
              client: {
                connect: {
                  userId: clientId ? clientId : user.id,
                },
              },
              // the ambassador is the user that invited client on the platform
              ambassadorCommission: ambassadorCommission,
              budget,
              financeStatus: budget && FinanceStatus.Pending,
              currency: {
                connect: {
                  id: currencyId ? currencyId : 1,
                },
              },
              // TODO remove platformProductOrderChatRooms,
              // TODO remove platformProductOrderComments,
              // TODO remove platformProductOrderInfluencers,
              // TODO remove platformProductsLabels,
              // TODO remove socialMediaListenings,   ! REMOVE FROM PRISMA SCHEMA
              platformProductOrderDiseaseAreas: diseaseAreaIds && {
                createMany: {
                  data: diseaseAreaIds.map((diseaseAreaId) => ({
                    diseaseAreaId,
                  })),
                },
              },
              platformProductOrderStruggles: struggleIds && {
                createMany: {
                  data: struggleIds.map((struggleId) => ({ struggleId })),
                },
              },
              platformProductOrderSymptoms: symptomIds && {
                createMany: {
                  data: symptomIds.map((symptomId) => ({ symptomId })),
                },
              },
              platformProductOrderLocations: locationIds && {
                createMany: {
                  data: locationIds.map((locationId) => ({ locationId })),
                },
              },
              platformProductOrderEthnicities: ethnicityIds && {
                // create: { ethnicityId },
                createMany: {
                  data: ethnicityIds.map((ethnicityId) => ({ ethnicityId })),
                },
              },
              platformProductOrderInterests: interestIds && {
                createMany: {
                  data: interestIds.map((interestId) => ({ interestId })),
                },
              },
              platformProductOrderGenders: genders && {
                createMany: { data: genders.map((gender) => ({ gender })) },
              },
              platformProductOrderLanguages: languages && {
                createMany: {
                  data: languages.map((language) => ({ language })),
                },
              },
              status: Status.InPreparation,
            },
          },
        },
        include: {
          ...this.campaignQueryIncludeSingle,
        },
      });

      if (report === ReportType.Yes) {
        await this.orderReport(
          {
            campaignId: campaign.id,
            reportType: ReportType.Yes, // TODO add a specific report type
          },
          user,
          tx,
        );
      }

      return campaign;
    });

    await this.cacheManager.del(`${campaign}-getClientCampaignsCountData`);

    return campaign;
  }

  async findAll(
    { skip, take, sortBy, search }: FilterParamsDto,
    filters: CampaignFilterDto,
    user: UserEntity,
  ) {
    const queryWhere: Prisma.CampaignWhereInput = {
      name: search && { contains: search, mode: 'insensitive' },
      platformProductOrder: {
        status:
          filters.status && filters.status.length
            ? { in: filters.status.map(Number) }
            : undefined,
        clientId: user.role === UserRole.Client ? user.client?.id : undefined,
        platformProductOrderInfluencers:
          user.role === UserRole.Influencer
            ? {
                some: {
                  // influencerId: user.influencer.id,
                  influencer: {
                    userId: user.id,
                  },
                },
              }
            : undefined,
      },
      campaignReport: filters.withNoReportOnly ? null : undefined,
    };
    const queryOrderBy: Prisma.Enumerable<Prisma.CampaignOrderByWithRelationInput> =
      (sortBy as any) || { createdAt: 'desc' };

    return await filterRecordsFactory(this.prismaService, (tx) => tx.campaign, {
      where: queryWhere,
      include: this.campaignQueryIncludeSingle,
      skip,
      take,
      orderBy: queryOrderBy,
    })();
  }

  async findAllCampaigns(
    { skip, take, sortBy, search }: FilterParamsDto,
    user: UserEntity,
  ) {
    const queryWhere: Prisma.CampaignWhereInput = {
      name: search && { contains: search, mode: 'insensitive' },
      platformProductOrder: {
        status: { in: [0, 1] },
        clientId: user.role === UserRole.Client ? user.client?.id : undefined,
        platformProductOrderInfluencers:
          user.role === UserRole.Influencer
            ? {
                some: {
                  influencer: {
                    userId: user.id,
                  },
                },
              }
            : undefined,
      },
    };
    const queryOrderBy: Prisma.Enumerable<Prisma.CampaignOrderByWithRelationInput> =
      (sortBy as any) || { createdAt: 'desc' };

    return await filterRecordsFactory(this.prismaService, (tx) => tx.campaign, {
      where: queryWhere,
      include: this.campaignQueryIncludeSingle,
      skip,
      take,
      orderBy: queryOrderBy,
    })();
  }

  async findAllCampaignsByFilters(
    { skip, take, sortBy }: FilterParamsDto,
    dto: CampaignFiltersDto,
  ) {
    const {
      budgetMax,
      budgetMin,
      endDateBegin,
      endDateEnd,
      influencerSizes,
      influencersMax,
      influencersMin,
      labels,
      postTypes,
      reports,
      schedules,
      search, //! TODO REWORK TO DYNAMIC OR/AND ACCORDING TO INPUT STRING LIKE: 'apple+pine'
      socialMedias,
      startDateBegin,
      startDateEnd,
    } = dto as CampaignSimpleFiltersDto;

    const { ambassadors, clients, companies, industries, products } =
      dto as ClientSimpleFiltersDto;
    const {
      ageMax,
      ageMin,
      diseaseAreas,
      ethnicities,
      genders,
      interests,
      languages,
      locations,
      struggles,
    } = dto as TargetSimpleFiltersDto;
    const querySelect: Prisma.CampaignSelect = {
      id: true,
    };

    const queryWhere: Prisma.CampaignWhereInput = {
      platformProductOrder: {
        budget: { gte: budgetMin, lte: budgetMax },
        platformProductOrderLabels: labels && {
          some: { labelId: { in: labels } },
        },
        platformProductOrderDiseaseAreas: diseaseAreas && {
          some: { diseaseAreaId: { in: diseaseAreas } },
        },
        platformProductOrderEthnicities: ethnicities && {
          some: { ethnicityId: { in: ethnicities } },
        },
        platformProductOrderGenders: genders && {
          some: { gender: { in: genders } },
        },
        platformProductOrderLanguages: languages && {
          some: { language: { in: languages } },
        },
        platformProductOrderInterests: interests && {
          some: { interestId: { in: interests } },
        },
        platformProductOrderLocations: {
          some: {
            OR: [
              { locationId: { in: locations } },
              { location: { countryId: { in: locations } } },
            ],
          },
        },
        platformProductOrderStruggles: {
          some: { struggleId: { in: struggles } },
        },
        client: {
          id: { in: clients },
          ambassador: { id: { in: ambassadors } },
          companyId: { in: companies }, //!? WHERE HE WORKS OR OWNS?
          industryId: { in: industries },
          user: {
            calendarEventAttendees: schedules && {
              some: { calendarEvent: { eventType: { in: schedules } } },
            },
          },
        },
      },
      ageMin: { equals: ageMin },
      ageMax: { equals: ageMax },
      products: products && {
        some: {
          productId: { in: products }, //? advertised in campaign or clients products?
        },
      },
      postType: { in: postTypes },
      report: { in: reports },
      AND: search?.map((word) => ({
        name: { contains: word },
      })),
      dateStart: { gte: startDateBegin, lte: startDateEnd },
      dateEnd: { gte: endDateBegin, lte: endDateEnd },
      campaignInfluencersSizes: influencerSizes && {
        some: { influencerSizeId: { in: influencerSizes } },
      },
      influencersCount: { gte: influencersMin, lte: influencersMax },
      socialPlatformId: { in: socialMedias },
    };
    const queryOrderBy: Prisma.Enumerable<Prisma.CampaignOrderByWithRelationInput> =
      (sortBy as any) || { createdAt: 'desc' };

    return filterRecordsFactory(this.prismaService, (tx) => tx.campaign, {
      where: queryWhere,
      select: querySelect,
      orderBy: queryOrderBy,
      skip,
      take,
    })();
  }

  async findAllCampaignsByCampaignFilters(dto: CampaignSimpleFiltersDto) {
    const {
      budgetMax,
      budgetMin,
      endDateBegin,
      endDateEnd,
      influencerSizes,
      influencersMax,
      influencersMin,
      labels,
      postTypes,
      reports,
      schedules,
      search, //! TODO REWORK TO DYNAMIC OR/AND ACCORDING TO INPUT STRING LIKE: 'apple+pen*pineapple+pen'
      socialMedias,
      startDateBegin,
      startDateEnd,
    } = dto;
    const querySelect: Prisma.CampaignSelect = {
      id: true,
    };
    const queryWhere: Prisma.CampaignWhereInput = {
      platformProductOrder: {
        budget: { gte: budgetMin, lte: budgetMax },
        platformProductOrderLabels: { some: { labelId: { in: labels } } },
        client: {
          user: {
            calendarEventAttendees: {
              some: { calendarEvent: { eventType: { in: schedules } } },
            },
          },
        },
      },
      postType: { in: postTypes },
      report: { in: reports },
      AND: search?.map((word) => ({
        name: { contains: word },
      })),
      dateStart: { gte: startDateBegin, lte: startDateEnd },
      dateEnd: { gte: endDateBegin, lte: endDateEnd },
      campaignInfluencersSizes: influencerSizes && {
        some: { influencerSizeId: { in: influencerSizes } },
      },
      influencersCount: { gte: influencersMin, lte: influencersMax },
      socialPlatformId: { in: socialMedias },
    };

    return this.prismaService.campaign.findMany({
      where: queryWhere,
      select: querySelect,
    });
  }

  // async findAllCampaignsByClientFilters(
  //   dto: ClientSimpleFiltersDto,
  //   campaigns: number[],
  // ) {
  //   const {
  //     ambassadors,
  //     campaignIds,
  //     clients,
  //     companies,
  //     industries,
  //     products,
  //   } = dto;

  //   const queryWhere: Prisma.ClientWhereInput = {};
  // }

  // async findAllCampaignsByTargetFilters(
  //   dto: TargetSimpleFiltersDto,
  //   campaigns: number[],
  // ) {
  //   return;
  // }

  async findOne(id: number) {
    return this.prismaService.campaign.findUniqueOrThrow({
      where: { id },
      include: {
        ...this.campaignQueryIncludeSingle,
      },
    });
  }

  async update(
    id: number,
    updateCampaignDto: UpdateCampaignDto,
    user: UserEntity,
  ) {
    const {
      name,
      clientId,
      budget,
      currencyId,
      diseaseAreaIds,
      stakeholderTypes,
      struggleIds,
      symptomIds,
      locationIds,
      languages,
      ethnicityIds,
      interestIds,
      productIds,
      dateStart,
      dateEnd,
      description,
      influencersCount,
      influencersSizeIds,
      ageMin,
      ageMax,
      genders,
      targetAudienceDescription,
      socialPlatformId,
      postType,
      exampleImageUrls,
      clientCompanyWebsite,
      instructions,
      report,
      status,

      /*       name,
      // clientId,
      productId,
      dateStart,
      dateEnd,
      reportType,
      budget,
      campaignDescription,
      influencersCount,
      influencersSizeId,
      diseaseAreaId,
      locationId,
      ageMin,
      ageMax,
      genderIds: genders,
      targetAudienceDescription,
      socialPlatformId,
      postType,
      imageExampleUrl,
      instructionsDescription,
      struggleIds,
      // languageId,
      ethnicityId,
      interestIds,
      clientCompanyWebsite,
      contract,
      report,
      isContractApproved,
      status, */
    } = updateCampaignDto;

    if (status && user.role === UserRole.Client) {
      // TODO handle with CASL
      throw new ApplicationException(`Can't update status`);
    }

    // we need to find know an id of a platform product order
    const {
      influencersCount: influencersCountOld,
      platformProductOrderId,
      platformProductOrder: { budget: budgetOld, status: statusOld },
    } = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id },
      select: {
        influencersCount: true,
        platformProductOrderId: true,
        platformProductOrder: {
          select: { id: true, budget: true, status: true },
        },
      },
    });

    const productNames = productIds.filter((item) => typeof item === 'string');
    const productNumbers = productIds.filter(
      (item) => typeof item === 'number',
    );

    const newProducts = [];

    if (productNames.length > 0) {
      const userPromise = clientId
        ? this.prismaService.user.findFirstOrThrow({
            where: {
              id: clientId,
            },
            select: {
              client: {
                select: {
                  id: true,
                },
              },
            },
          })
        : Promise.resolve(null);

      const clientUser = await userPromise;

      for (let i = 0; i < productNames.length; i++) {
        const createdByClientId = clientUser?.client.id ?? user.client.id;
        const newProduct = await this.prismaService.product.create({
          data: {
            name: productNames[i].toString(),
            isApproved: false,
            createdByClientId,
          },
        });

        if (newProduct) {
          newProducts.push(newProduct.id);
        }
      }
    }

    const finalProductsIds = [...productNumbers, ...newProducts];

    if (
      statusOld !== Status.InPreparation &&
      Object.keys(updateCampaignDto).some(
        (property) => updateCampaignDto[property] !== undefined,
      )
    ) {
      throw new ApplicationException(
        `Can't update campaign that is on-going or finished`,
      );
    } else if (budgetOld > budget && user.role === UserRole.Client) {
      // TODO handle with CASL
      throw new ApplicationException(`Can't put budget below current amount`);
    } else if (
      influencersCountOld > influencersCount &&
      user.role === UserRole.Client
    ) {
      // TODO handle with CASL
      throw new ApplicationException(
        `Can't put the number of influencers below current number`,
      );
    }

    return this.prismaService.campaign.update({
      where: { id },
      data: {
        name,
        stakeholderTypes: stakeholderTypes && {
          deleteMany: {
            campaignId: id,
            stakeholderType: { notIn: stakeholderTypes },
          },
          upsert: stakeholderTypes.map((stakeholderType) => ({
            create: { stakeholderType },
            update: { stakeholderType },
            where: {
              CampaignStakeholderTypeIdentifier: {
                campaignId: id,
                stakeholderType,
              },
            },
          })),
        },
        products: finalProductsIds && {
          deleteMany: {
            campaignId: id,
            productId: { notIn: finalProductsIds },
          },
          upsert: finalProductsIds.map((productId) => ({
            create: { productId },
            update: { productId },
            where: {
              CampaignProductIdentifier: {
                campaignId: id,
                productId,
              },
            },
          })),
        },
        dateStart,
        dateEnd,
        description,
        influencersCount,
        campaignInfluencersSizes: influencersSizeIds && {
          deleteMany: {
            campaignId: id,
            influencerSizeId: { notIn: influencersSizeIds },
          },
          upsert: influencersSizeIds.map((influencerSizeId) => ({
            create: { influencerSizeId },
            update: { influencerSizeId },
            where: {
              CampaignInfluencersSizeIdentifier: {
                campaignId: id,
                influencerSizeId,
              },
            },
          })),
        },
        ageMin,
        ageMax,
        targetAudienceDescription,
        socialPlatformId,
        postType,
        exampleImages: exampleImageUrls && {
          deleteMany: {
            campaignId: id,
            imageUrl: { notIn: exampleImageUrls },
          },
          upsert: exampleImageUrls.map((imageUrl) => ({
            create: { imageUrl },
            update: { imageUrl },
            where: {
              CampaignExampleImageIdentifier: {
                campaignId: id,
                imageUrl,
              },
            },
          })),
        },
        clientCompanyWebsite,
        instructions,
        report,
        platformProductOrder: {
          update: {
            ambassadorCommission: ambassadorCommission,
            budget, // TODO client musn't be able to update budget to lower value
            client: {
              connect: {
                userId: clientId ? clientId : user.id,
              },
            },
            currency: currencyId && {
              connect: { id: currencyId || 3 },
            },
            platformProductOrderDiseaseAreas: diseaseAreaIds && {
              deleteMany: {
                productOrderId: platformProductOrderId,
                diseaseAreaId: { notIn: diseaseAreaIds },
              },
              upsert: diseaseAreaIds.map((diseaseAreaId) => ({
                create: { diseaseAreaId },
                update: { diseaseAreaId },
                where: {
                  productOrderId_diseaseAreaId: {
                    productOrderId: platformProductOrderId,
                    diseaseAreaId,
                  },
                },
              })),
            },
            platformProductOrderStruggles: struggleIds && {
              deleteMany: {
                productOrderId: platformProductOrderId,
                struggleId: { notIn: struggleIds },
              },
              upsert: struggleIds.map((struggleId) => ({
                create: { struggleId },
                update: { struggleId },
                where: {
                  productOrderId_struggleId: {
                    productOrderId: platformProductOrderId,
                    struggleId,
                  },
                },
              })),
            },
            platformProductOrderSymptoms: symptomIds && {
              deleteMany: {
                productOrderId: platformProductOrderId,
                symptomId: { notIn: symptomIds },
              },
              upsert: symptomIds.map((symptomId) => ({
                create: { symptomId },
                update: { symptomId },
                where: {
                  productOrderId_symptomId: {
                    productOrderId: platformProductOrderId,
                    symptomId,
                  },
                },
              })),
            },
            platformProductOrderLocations: locationIds && {
              deleteMany: {
                productOrderId: platformProductOrderId,
                locationId: { notIn: locationIds },
              },
              upsert: locationIds.map((locationId) => ({
                create: { locationId },
                update: { locationId },
                where: {
                  productOrderId_locationId: {
                    productOrderId: platformProductOrderId,
                    locationId,
                  },
                },
              })),
            },
            platformProductOrderEthnicities: ethnicityIds && {
              deleteMany: {
                productOrderId: platformProductOrderId,
                ethnicityId: { notIn: ethnicityIds },
              },
              upsert: ethnicityIds.map((ethnicityId) => ({
                create: { ethnicityId },
                update: { ethnicityId },
                where: {
                  productOrderId_ethnicityId: {
                    productOrderId: platformProductOrderId,
                    ethnicityId,
                  },
                },
              })),
            },
            platformProductOrderInterests: interestIds && {
              deleteMany: {
                productOrderId: platformProductOrderId,
                interestId: { notIn: interestIds },
              },
              upsert: interestIds.map((interestId) => ({
                create: { interestId },
                update: { interestId },
                where: {
                  productOrderId_interestId: {
                    productOrderId: platformProductOrderId,
                    interestId,
                  },
                },
              })),
            },
            platformProductOrderGenders: genders && {
              deleteMany: {
                productOrderId: platformProductOrderId,
                gender: { notIn: genders },
              },
              upsert: genders.map((gender) => ({
                create: { gender },
                update: { gender },
                where: {
                  productOrderId_gender: {
                    productOrderId: platformProductOrderId,
                    gender,
                  },
                },
              })),
            },
            platformProductOrderLanguages: languages && {
              deleteMany: {
                productOrderId: platformProductOrderId,
                language: { notIn: languages },
              },
              upsert: languages.map((language) => ({
                create: { language },
                update: { language },
                where: {
                  productOrderId_language: {
                    productOrderId: platformProductOrderId,
                    language,
                  },
                },
              })),
            },
            status,
          },
        },
      },
      include: {
        ...this.campaignQueryIncludeSingle,
      },
    });
  }

  async remove(id: number) {
    return this.prismaService.campaign.delete({
      where: { id },
    });
  }

  async deleteMany(dto: DeleteManyCampaignsDto) {
    const { campaignIds } = dto;
    try {
      const existingCampaigns = await this.prismaService.campaign.findMany({
        where: {
          id: { in: campaignIds },
        },
        select: {
          id: true,
        },
      });

      const existingCampaignIds = existingCampaigns.map(
        (campaign) => campaign.id,
      );
      const missingCampaignIds = campaignIds.filter(
        (campaignId) => !existingCampaignIds.includes(campaignId),
      );

      if (missingCampaignIds.length > 0) {
        throw new NotFoundException(
          `Campaigns with IDs ${missingCampaignIds.join(', ')} not found.`,
        );
      }

      const deletedCampaigns = await this.prismaService.campaign.deleteMany({
        where: {
          id: {
            in: campaignIds,
          },
        },
      });

      return deletedCampaigns;
    } catch (error) {
      throw error;
    }
  }

  async deleteManyReports(dto: DeleteManyCampaignReportsDto) {
    const { reportIds } = dto;
    try {
      const existingReports = await this.prismaService.campaignReport.findMany({
        where: {
          id: { in: reportIds },
        },
        select: {
          id: true,
        },
      });

      const existingReportIds = existingReports.map(
        (campaignReport) => campaignReport.id,
      );
      const missingCampaignReportIds = reportIds.filter(
        (campaignReportId) => !existingReportIds.includes(campaignReportId),
      );

      if (missingCampaignReportIds.length > 0) {
        throw new NotFoundException(
          `Campaigns with IDs ${missingCampaignReportIds.join(
            ', ',
          )} not found.`,
        );
      }

      const deletedCampaignReports =
        await this.prismaService.campaignReport.deleteMany({
          where: {
            id: {
              in: reportIds,
            },
          },
        });

      return deletedCampaignReports;
    } catch (error) {
      throw error;
    }
  }

  async track(code: string) {
    try {
      const {
        campaign: { clientCompanyWebsite },
      } = await this.prismaService.campaignInfluencerPerformance.update({
        where: { trackingCode: code },
        data: { websiteClick: { increment: 1 } },
        select: {
          campaign: {
            select: {
              clientCompanyWebsite: true,
            },
          },
        },
      });

      return clientCompanyWebsite;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundApplicationException(`Cannot track a code`);
      }

      throw err;
    }
  }

  async addInfluencers(campaignId: number, influencerIds: number[]) {
    const campaign = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      select: {
        platformProductOrderId: true,
        platformProductOrder: true,
        postType: true,
      },
    });

    // ! if influencers FOR EXAMPLE failed in some scenario, there has to be
    // ! a way to add a new influencers instead old ones
    if (campaign.platformProductOrder.status >= Status.Finished) {
      throw new ForbiddenApplicationException(
        `Can't add influencer/s after the campaign has finished`,
      );
    } else if ([undefined, null].includes(campaign.postType)) {
      throw new BadRequestApplicationException(
        `Campaign has to have post type defined`,
      );
    }

    const userInfluencers = await this.prismaService.user.findMany({
      where: { id: { in: influencerIds } },
      select: {
        id: true,
        currency: true,
        influencer: {
          select: {
            id: true,
            userId: true,
            influencerCampaignAmounts: {
              // it is expected for an influencer to have these settings defined
              where: { postType: campaign.postType },
            },
          },
        },
      },
    });

    const userInfluencersNotExist = influencerIds.filter(
      (influencerId) =>
        !userInfluencers.find(
          (userInfluencer) => userInfluencer.id === influencerId,
        ),
    );

    if (userInfluencersNotExist.length) {
      throw new NotFoundApplicationException(
        userInfluencersNotExist.length === 1
          ? `Influencer ${userInfluencersNotExist[0]} does not exist`
          : `Influencers ${userInfluencersNotExist.join(', ')} do not exist`,
      );
    }

    return await Promise.all(
      userInfluencers.map((userInfluencer) =>
        this.prismaService.platformProductOrderInfluencer.upsert({
          create: {
            productOrderId: campaign.platformProductOrderId,
            influencerId: userInfluencer.influencer.id,
            agreedAmount:
              userInfluencer.influencer.influencerCampaignAmounts[0]
                .desiredAmount,
            currency: userInfluencer.currency,
            status: ProductOrderInfluencerStatus.Added,
          },
          update: {
            // update agreed amount and currency only, if an influencer is already added
            agreedAmount:
              userInfluencer.influencer.influencerCampaignAmounts[0]
                .desiredAmount,
            currency: userInfluencer.currency,
          },
          where: {
            PlatformProductOrderInfluencerIdentifier: {
              productOrderId: campaign.platformProductOrderId,
              influencerId: userInfluencer.influencer.id,
            },
          },
        }),
      ),
    );
    // return await this.prismaService.campaign.update({
    //   where: { id: campaignId },
    //   data: {
    //     platformProductOrder: {
    //       update: {
    //         platformProductOrderInfluencers: {
    //           upsert: userInfluencers.map((userInfluencer) => ({
    //             create: {
    //               influencerId: userInfluencer.influencer.id,
    //               agreedAmount:
    //                 userInfluencer.influencer.influencerCampaignAmounts[0]
    //                   .desiredAmount,
    //               currency: userInfluencer.currency,
    //               status: ProductOrderInfluencerStatus.Added,
    //             },
    //             update: {
    //               // update agreed amount and currency only, if an influencer is already added
    //               agreedAmount:
    //                 userInfluencer.influencer.influencerCampaignAmounts[0]
    //                   .desiredAmount,
    //               currency: userInfluencer.currency,
    //             },
    //             where: {
    //               PlatformProductOrderInfluencerIdentifier: {
    //                 productOrderId: campaign.platformProductOrderId,
    //                 influencerId: userInfluencer.influencer.id,
    //               },
    //             },
    //           })),
    //         },
    //       },
    //     },
    //   },
    // });
  }

  async inviteInfluencers(campaignId: number, dto: CampaignInviteInfluencers) {
    const { influencerIds } = dto;
    const campaign = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      select: {
        platformProductOrderId: true,
        platformProductOrder: {
          select: {
            id: true,
            platformProductOrderInfluencers: {
              where: { influencer: { id: { in: influencerIds } } },
              select: {
                id: true,
                status: true,
                influencer: {
                  select: {
                    id: true,
                    userId: true,
                  },
                },
              },
            },
            status: true,
          },
        },
      },
    });

    const campaignInfluencers =
      campaign.platformProductOrder.platformProductOrderInfluencers;
    const userInfluencersNotInCampaign = influencerIds.filter(
      (influencerId) =>
        !campaignInfluencers.find(
          (campaignInfluencer) =>
            campaignInfluencer.influencer.id === influencerId,
        ),
    );

    // // check if influencers that are not added or not previously invited, are invited
    // // * if the influencer is previously invited, this should trigger repeated invitation
    const campaignInfluencersWithInvalidStatus = campaignInfluencers.filter(
      (campaignInfluencer) =>
        ![
          ProductOrderInfluencerStatus.Added,
          ProductOrderInfluencerStatus.Invited,
        ].includes(campaignInfluencer.status),
    );

    if (userInfluencersNotInCampaign.length) {
      throw new BadRequestApplicationException(
        userInfluencersNotInCampaign.length === 1
          ? `Influencer ${userInfluencersNotInCampaign[0]} is not in the campaign ${campaignId}`
          : `Influencers ${userInfluencersNotInCampaign.join(
              ', ',
            )} are not in the campaign ${campaignId}`,
      );
    } else if (campaignInfluencersWithInvalidStatus.length) {
      throw new BadRequestApplicationException(
        campaignInfluencersWithInvalidStatus.length === 1
          ? `Influencer ${campaignInfluencersWithInvalidStatus[0]} doesn't have valid state to be invited`
          : `Influencers ${campaignInfluencersWithInvalidStatus.join(
              ', ',
            )} don't have valid state to be invited`,
      );
    }

    return await Promise.all(
      campaignInfluencers.map((campaignInfluencer) =>
        this.prismaService.platformProductOrderInfluencer.update({
          data: { status: ProductOrderInfluencerStatus.Invited },
          where: {
            id: campaignInfluencer.id,
          },
        }),
      ),
    );
  }

  async acceptInvitation(campaignId: number, user: UserWithInfluencer) {
    if (!user.influencer) {
      throw new BadRequestApplicationException(
        `User ${userIdentity(user)} is not an influencer`,
      );
    }

    const campaign = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      select: {
        platformProductOrderId: true,
        platformProductOrder: {
          select: {
            id: true,
            platformProductOrderInfluencers: {
              where: { influencerId: user.influencer.id },
            },
            status: true,
          },
        },
      },
    });

    const campaignInfluencer =
      campaign.platformProductOrder.platformProductOrderInfluencers[0];

    if (!campaignInfluencer) {
      throw new BadRequestApplicationException(
        `Influencer ${userIdentity(user)} is not in the campaign ${campaignId}`,
      );
    } else if (
      campaignInfluencer.status !== ProductOrderInfluencerStatus.Invited
    ) {
      throw new BadRequestApplicationException(
        `Influencer ${userIdentity(user)} is not invited`,
      );
    }

    return this.prismaService.platformProductOrderInfluencer.update({
      data: { status: ProductOrderInfluencerStatus.Matching },
      where: {
        id: campaignInfluencer.id,
      },
    });
  }

  async declineInvitation(campaignId: number, user: UserWithInfluencer) {
    if (!user.influencer) {
      throw new BadRequestApplicationException(
        `User ${userIdentity(user)} is not an influencer`,
      );
    }

    const campaign = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      select: {
        platformProductOrderId: true,
        platformProductOrder: {
          select: {
            id: true,
            platformProductOrderInfluencers: {
              where: { influencerId: user.influencer.id },
            },
            status: true,
          },
        },
      },
    });

    const campaignInfluencer =
      campaign.platformProductOrder.platformProductOrderInfluencers[0];

    if (!campaignInfluencer) {
      throw new BadRequestApplicationException(
        `Influencer ${userIdentity(user)} is not in the campaign ${campaignId}`,
      );
    } else if (
      campaignInfluencer.status !== ProductOrderInfluencerStatus.Invited
    ) {
      throw new BadRequestApplicationException(
        `Influencer ${userIdentity(user)} is not invited`,
      );
    }

    return this.prismaService.platformProductOrderInfluencer.update({
      data: { status: ProductOrderInfluencerStatus.Declined },
      where: {
        id: campaignInfluencer.id,
      },
    });
  }

  async removeInfluencers(campaignId: number, influencerIds: number[]) {
    const campaign = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      select: {
        platformProductOrderId: true,
        platformProductOrder: {
          select: {
            id: true,
            platformProductOrderInfluencers: {
              where: { influencer: { id: { in: influencerIds } } },
              select: {
                id: true,
                status: true,
                influencer: {
                  select: {
                    id: true,
                    userId: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    const campaignInfluencers =
      campaign.platformProductOrder.platformProductOrderInfluencers;
    const userInfluencersNotInCampaign = influencerIds.filter(
      (influencerId) =>
        !campaignInfluencers.find(
          (campaignInfluencer) =>
            campaignInfluencer.influencer.id === influencerId,
        ),
    );

    if (userInfluencersNotInCampaign.length) {
      throw new BadRequestApplicationException(
        userInfluencersNotInCampaign.length === 1
          ? `Influencer ${userInfluencersNotInCampaign[0]} is not in the campaign ${campaignId}`
          : `Influencers ${userInfluencersNotInCampaign.join(
              ', ',
            )} are not in the campaign ${campaignId}`,
      );
    }

    // // TODO if campaign has started, only admin can remove
    // // ! => only admin can put to status REMOVED, not client

    // // TODO refactor to return records, not the number of affected records
    const [influencersNotSelected, influencersRemoved] = await Promise.all([
      this.prismaService.platformProductOrderInfluencer.updateMany({
        data: { status: ProductOrderInfluencerStatus.NotSelected },
        where: {
          productOrderId: campaign.platformProductOrderId,
          influencerId: { in: influencerIds },
          status: {
            in: [
              ProductOrderInfluencerStatus.Added,
              ProductOrderInfluencerStatus.Invited,
              ProductOrderInfluencerStatus.Matching,
            ],
          },
        },
      }),
      this.prismaService.platformProductOrderInfluencer.updateMany({
        data: { status: ProductOrderInfluencerStatus.Removed },
        where: {
          productOrderId: campaign.platformProductOrderId,
          influencerId: { in: influencerIds },
          status: {
            in: [
              // * if status is ADDED|INVITED|MATCHING, next status is NOT SELECTED
              ProductOrderInfluencerStatus.ToBeSubmitted,
              ProductOrderInfluencerStatus.ToBeApproved,
              ProductOrderInfluencerStatus.Approved,
              ProductOrderInfluencerStatus.ToBePaid,
              ProductOrderInfluencerStatus.Paid,
            ],
          },
        },
      }),
    ]);

    return {
      count: influencersNotSelected.count + influencersRemoved.count,
    } as Prisma.BatchPayload;
  }

  async removeInfluencerSelf(campaignId: number, user: UserWithInfluencer) {
    if (!user.influencer) {
      throw new BadRequestApplicationException(
        `User ${userIdentity(user)} is not an influencer`,
      );
    }

    const campaign = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      select: {
        platformProductOrderId: true,
        platformProductOrder: {
          select: {
            id: true,
            platformProductOrderInfluencers: {
              where: { influencerId: user.influencer.id },
            },
          },
        },
      },
    });
    const campaignInfluencer =
      campaign.platformProductOrder.platformProductOrderInfluencers[0];

    if (
      user.influencer.id !== campaignInfluencer.influencerId ||
      campaignInfluencer.status < ProductOrderInfluencerStatus.Invited
    ) {
      throw new ApplicationException(
        `Influencer ${userIdentity(
          user,
        )} is not in the campaign ${campaignId} or is not invited yet`,
      );
    } else if (
      campaignInfluencer.status === ProductOrderInfluencerStatus.Invited
    ) {
      throw new ForbiddenApplicationException(
        `Can't remove itself from the campaign if invitation is not accepted, eg. not in the campaign`,
      );
    }

    return this.prismaService.platformProductOrderInfluencer.update({
      data: { status: ProductOrderInfluencerStatus.Withdrawn },
      where: {
        id: campaignInfluencer.id,
      },
    });
  }

  async confirmMatch(campaignId: number, influencerIds: number[]) {
    const campaign = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      select: {
        platformProductOrderId: true,
        platformProductOrder: {
          select: {
            id: true,
            platformProductOrderInfluencers: {
              where: { influencer: { userId: { in: influencerIds } } },
              select: {
                id: true,
                status: true,
                influencer: {
                  select: {
                    userId: true,
                  },
                },
              },
            },
            status: true,
          },
        },
      },
    });

    const campaignInfluencers =
      campaign.platformProductOrder.platformProductOrderInfluencers;
    const userInfluencersNotInCampaign = influencerIds.filter(
      (influencerId) =>
        !campaignInfluencers.find(
          (campaignInfluencer) =>
            campaignInfluencer.influencer.userId === influencerId,
        ),
    );
    // check if influencers have matching status
    const campaignInfluencersWithInvalidStatus = campaignInfluencers.filter(
      (campaignInfluencer) =>
        campaignInfluencer.status !== ProductOrderInfluencerStatus.Matching,
    );

    if (userInfluencersNotInCampaign.length) {
      throw new BadRequestApplicationException(
        userInfluencersNotInCampaign.length === 1
          ? `Influencer ${userInfluencersNotInCampaign[0]} is not in the campaign ${campaignId}`
          : `Influencers ${userInfluencersNotInCampaign.join(
              ', ',
            )} are not in the campaign ${campaignId}`,
      );
    } else if (campaignInfluencersWithInvalidStatus.length) {
      throw new BadRequestApplicationException(
        campaignInfluencersWithInvalidStatus.length === 1
          ? `Influencer ${campaignInfluencersWithInvalidStatus[0]} doesn't have valid state to confirm a match`
          : `Influencers ${campaignInfluencersWithInvalidStatus.join(
              ', ',
            )} don't have valid state to confirm a match`,
      );
    }

    return await Promise.all(
      campaignInfluencers.map((campaignInfluencer) =>
        this.prismaService.platformProductOrderInfluencer.update({
          data: { status: ProductOrderInfluencerStatus.ToBeSubmitted },
          where: {
            id: campaignInfluencer.id,
          },
        }),
      ),
    );
  }

  async submitInfluencerData(
    campaignId: number,
    user: UserWithInfluencer,
    data: SubmitInfluencerDataDto,
  ) {
    if (!user.influencer) {
      throw new BadRequestApplicationException(
        `User ${userIdentity(user)} is not an influencer`,
      );
    }

    const campaign = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      include: {
        campaignInfluencerPerformances: {
          where: { influencerId: user.influencer.id },
        },
        platformProductOrder: {
          select: {
            id: true,
            platformProductOrderInfluencers: {
              where: { influencerId: user.influencer.id },
            },
          },
        },
      },
    });
    const campaignInfluencer =
      campaign.platformProductOrder.platformProductOrderInfluencers[0];

    // TODO remove (contract doesn't exist anymore)
    if (
      ![
        ProductOrderInfluencerStatus.ToBeSubmitted,
        ProductOrderInfluencerStatus.NotApproved,
      ].includes(campaignInfluencer.status)
    ) {
      throw new ForbiddenApplicationException(
        `Influencer ${userIdentity(
          user,
        )} doesn't have a match (or is already approved) - confirm a match first`,
      );
    }

    return await this.prismaService.$transaction(async (tx) => {
      await tx.platformProductOrderInfluencer.update({
        data: {
          status: ProductOrderInfluencerStatus.ToBeApproved,
        },
        where: {
          id: campaignInfluencer.id,
        },
      });

      return tx.campaignInfluencerPerformance.upsert({
        create: {
          campaignId,
          influencerId: user.influencer.id,
          submissionLink: data.submissionLink,
          // * save unique ID only, not the whole link (website link)
          trackingCode: idToPseudostring(user.influencer.id),
          websiteClick: 0,
        },
        update: { submissionLink: data.submissionLink },
        where: {
          CampaignInfluencerPerformanceIdentifier: {
            campaignId,
            influencerId: user.influencer.id,
          },
        },
      });
    });
  }

  // * accept
  async approveSubmission(campaignId: number, influencerIds: number[]) {
    const campaign = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      include: {
        exampleImages: true,
        platformProductOrder: {
          include: {
            platformProductOrderInfluencers: {
              where: { influencer: { userId: { in: influencerIds } } },
              select: {
                id: true,
                status: true,
                influencer: {
                  select: {
                    userId: true,
                  },
                },
              },
            },
          },
        },
        campaignInfluencerPerformances: true,
      },
    });
    const campaignInfluencers =
      campaign.platformProductOrder.platformProductOrderInfluencers;
    const userInfluencersNotInCampaign = influencerIds.filter(
      (influencerId) =>
        !campaignInfluencers.find(
          (campaignInfluencer) =>
            campaignInfluencer.influencer.userId === influencerId,
        ),
    );
    const campaignInfluencersWithInvalidStatus = campaignInfluencers.filter(
      (campaignInfluencer) =>
        ![
          ProductOrderInfluencerStatus.ToBeApproved,
          ProductOrderInfluencerStatus.NotApproved,
        ].includes(campaignInfluencer.status),
    );

    if (userInfluencersNotInCampaign.length) {
      throw new BadRequestApplicationException(
        userInfluencersNotInCampaign.length === 1
          ? `Influencer ${userInfluencersNotInCampaign[0]} is not in the campaign ${campaignId}`
          : `Influencers ${userInfluencersNotInCampaign.join(
              ', ',
            )} are not in the campaign ${campaignId}`,
      );
    } else if (campaignInfluencersWithInvalidStatus.length) {
      throw new BadRequestApplicationException(
        campaignInfluencersWithInvalidStatus.length === 1
          ? `Influencer ${campaignInfluencersWithInvalidStatus[0]} doesn't have valid state to become approved - force him to submit the required data`
          : `Influencers ${campaignInfluencersWithInvalidStatus.join(
              ', ',
            )} don't have valid state to become approved - force them to submit the required data`,
      );
    }

    return this.prismaService.platformProductOrderInfluencer.updateMany({
      data: {
        status: ProductOrderInfluencerStatus.Approved,
      },
      where: {
        productOrderId: campaign.platformProductOrderId,
      },
    });
  }

  // * decline
  async disapproveSubmission(campaignId: number, influencerIds: number[]) {
    const campaign = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      include: {
        exampleImages: true,
        platformProductOrder: {
          include: {
            platformProductOrderInfluencers: {
              where: { influencer: { userId: { in: influencerIds } } },
              select: {
                id: true,
                status: true,
                influencer: {
                  select: {
                    userId: true,
                  },
                },
              },
            },
          },
        },
        campaignInfluencerPerformances: true,
      },
    });
    const campaignInfluencers =
      campaign.platformProductOrder.platformProductOrderInfluencers;
    const userInfluencersNotInCampaign = influencerIds.filter(
      (influencerId) =>
        !campaignInfluencers.find(
          (campaignInfluencer) =>
            campaignInfluencer.influencer.userId === influencerId,
        ),
    );
    const campaignInfluencersWithInvalidStatus = campaignInfluencers.filter(
      (campaignInfluencer) =>
        campaignInfluencer.status !== ProductOrderInfluencerStatus.ToBeApproved,
    );

    if (userInfluencersNotInCampaign.length) {
      throw new BadRequestApplicationException(
        userInfluencersNotInCampaign.length === 1
          ? `Influencer ${userInfluencersNotInCampaign[0]} is not in the campaign ${campaignId}`
          : `Influencers ${userInfluencersNotInCampaign.join(
              ', ',
            )} are not in the campaign ${campaignId}`,
      );
    } else if (campaignInfluencersWithInvalidStatus.length) {
      throw new BadRequestApplicationException(
        campaignInfluencersWithInvalidStatus.length === 1
          ? `Influencer ${campaignInfluencersWithInvalidStatus[0]} doesn't have valid state to become disapproved - force him to submit the required data`
          : `Influencers ${campaignInfluencersWithInvalidStatus.join(
              ', ',
            )} don't have valid state to become disapproved - force them to submit the required data`,
      );
    }

    await this.prismaService.platformProductOrderInfluencer.updateMany({
      data: {
        status: ProductOrderInfluencerStatus.NotApproved,
      },
      where: {
        productOrderId: campaign.platformProductOrderId,
      },
    });
  }

  async startCampaign(campaignId: number) {
    const campaign = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      include: {
        exampleImages: true,
        platformProductOrder: {
          include: {
            platformProductOrderInfluencers: true,
          },
        },
        campaignInfluencerPerformances: true,
      },
    });
    // ? see if number of influencers involved in the campaign is equal to number of approved ones
    const campaignInfluencers =
      campaign.platformProductOrder.platformProductOrderInfluencers;

    if (campaign.platformProductOrder.status === Status.OnGoing) {
      throw new BadRequestApplicationException(
        `Campaign ${campaignId} has already started`,
      );
    } else if (campaign.platformProductOrder.status > Status.OnGoing) {
      throw new BadRequestApplicationException(
        `Campaign ${campaignId} has finished`,
      );
    } else if (
      !campaign.instructions
      // * no website -> no web clicks
    ) {
      throw new BadRequestApplicationException(
        `Fill the data required: instructions`,
      );
    }

    return this.prismaService.campaign.update({
      data: {
        platformProductOrder: {
          update: {
            status: Status.OnGoing,
          },
        },
      },
      where: {
        id: campaignId,
      },
    });
  }

  async finishCampaign(campaignId: number) {
    const campaign = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      include: { platformProductOrder: true },
    });

    if (campaign.platformProductOrder.status !== Status.OnGoing) {
      throw new ForbiddenApplicationException(
        `Campaign can't be stopped as it is not started`,
      );
    } else if (campaign.platformProductOrder.status > Status.Finished) {
      throw new ForbiddenApplicationException(
        `Campaign can't be stopped as it is already finished`,
      );
    }

    return await this.prismaService.$transaction(async (tx) => {
      await tx.platformProductOrderInfluencer.updateMany({
        data: {
          status: ProductOrderInfluencerStatus.ToBePaid,
        },
        where: {
          status: ProductOrderInfluencerStatus.Approved,
        },
      });

      return this.prismaService.campaign.update({
        data: {
          platformProductOrder: {
            update: {
              status: Status.Finished,
            },
          },
        },
        where: {
          id: campaignId,
        },
      });
    });
  }

  async archiveCampaign(campaignId: number) {
    const campaign = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      include: { platformProductOrder: true },
    });

    if (campaign.platformProductOrder.status <= Status.OnGoing) {
      throw new ForbiddenApplicationException(
        `Campaign can't be archived as it is not finished`,
      );
    } else if (campaign.platformProductOrder.status === Status.Archived) {
      throw new ForbiddenApplicationException(`Campaign is already archived`);
    }

    return this.prismaService.campaign.update({
      data: {
        platformProductOrder: {
          update: {
            status: Status.Archived,
          },
        },
      },
      where: {
        id: campaignId,
      },
    });
  }

  async orderReport(
    orderReportDto: OrderReportDto,
    user: UserEntity,
    tx?: Omit<
      PrismaService,
      '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
    >,
  ) {
    const { campaignId, reportType, budget, description, ...dataProperties } =
      orderReportDto;

    const campaign = await (tx || this.prismaService).campaign.findFirstOrThrow(
      {
        where: { id: campaignId },
        include: { platformProductOrder: true },
      },
    );
    try {
      return await (tx || this.prismaService).campaignReport.create({
        data: {
          platformProductOrder: {
            create: {
              platformProduct: PlatformProduct.CampaignReport,
              clientId: campaign.platformProductOrder.clientId,
              budget,
              status: Status.Ordered,
            },
          },
          // campaignId,
          campaign: { connect: { id: campaignId } },
          reportType,
          status: Status.Ordered, // TODO remove from here
          description,
          numOfComments: true,
          numOfLikes: true,
          reach: true,
          ...(user.role === UserRole.SuperAdmin ? dataProperties : undefined),
          // ! rest is false if a client creates a report
        },
        include: {
          platformProductOrder: true,
          campaign: {
            include: {
              ...this.campaignQueryIncludeSingle,
            },
          },
        },
      });
    } catch (err) {
      if (err.code === 'P2014') {
        throw new BadRequestApplicationException(
          `A report for the same campaign is already requested.`,
        );
      }
      throw err;
    }
  }

  async updateReport(
    reportId: number,
    updateReportDto: UpdateReportDto,
    user: UserEntity,
  ) {
    const { reportType, budget, description } = updateReportDto;

    if (user.role === UserRole.Client) {
      throw new ForbiddenApplicationException(
        `Cannot update a report: contact support`,
      );
    }

    // ! uncomment if degradation of exposed data properties is forbidden
    /* if (
      Object.keys(dataProperties).filter(
        (reportProperty) =>
          !dataProperties[reportProperty] && report[reportProperty],
      ).length
    ) {
      throw new ForbiddenApplicationException(
        `Cannot update a report that doesn't have properties included from previously requested report`,
      );
    } */

    return this.prismaService.campaignReport.update({
      where: { id: +reportId },
      data: {
        // ? forbid report type degradation
        reportType,
        platformProductOrder: {
          update: {
            budget,
          },
        },
        campaign: {
          update: {
            report: reportType,
          },
        },
        description,
      },
      include: {
        platformProductOrder: true,
        campaign: {
          include: {
            ...this.campaignQueryIncludeSingle,
          },
        },
      },
    });
  }

  async removeReport(reportId: number) {
    return this.prismaService.campaignReport.delete({
      where: { id: reportId },
    });
  }

  async markReportAsReady(reportId: number) {
    return this.prismaService.campaignReport.update({
      where: { id_status: { id: reportId, status: Status.Ordered } },
      data: {
        status: Status.Ready,
        platformProductOrder: {
          update: {
            status: Status.Ready,
          },
        },
      },
    });
  }

  async deliverReport(reportId: number) {
    return this.prismaService.campaignReport.update({
      where: { id_status: { id: reportId, status: Status.Ready } },
      data: {
        status: Status.Delivered,
        platformProductOrder: {
          update: {
            status: Status.Delivered,
          },
        },
      },
    });
  }

  async getReports(
    { skip, take, sortBy, search }: FilterParamsDto,
    filters: CampaignReportFilterDto,
    user: User,
  ) {
    let queryWhere: Prisma.CampaignReportWhereInput = {
      status: filters.status,
      reportType: filters.reportType,
    };
    const queryInclude: Prisma.CampaignReportInclude = {
      platformProductOrder: true,
      campaign: {
        include: {
          ...this.campaignQueryIncludeMany,
        },
      },
    };
    const queryOrderBy: Prisma.Enumerable<Prisma.CampaignReportOrderByWithRelationInput> =
      (sortBy as any) || { createdAt: 'desc' };

    if (user.role === UserRole.Client) {
      queryWhere = {
        ...queryWhere,
        campaign: {
          platformProductOrder: {
            client: {
              userId: user.id,
            },
            campaignReports: {
              every: {},
            },
          },
        },
      };
    }

    return await filterRecordsFactory(
      this.prismaService,
      (tx) => tx.campaignReport,
      {
        where: queryWhere,
        include: queryInclude,
        skip,
        take,
        orderBy: queryOrderBy,
      },
    )();
  }

  async calculateInfluencersPerformances(campaignId: number) {
    const campaign = await this.prismaService.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      include: {
        campaignInfluencerPerformances: {
          include: {
            influencer: {
              include: {
                influencerFollowers: {
                  include: {
                    stakeholder: {
                      include: {
                        influencer: true,
                      },
                    },
                  },
                },
              },
            },
            likers: {
              include: {
                stakeholder: true,
              },
            },
          },
        },
        platformProductOrder: {
          include: {
            platformProductOrderInfluencers: true,
          },
        },
      },
    });
    return campaign.campaignInfluencerPerformances.map(
      (
        campaignInfluencerPerformance,
      ): Partial<
        CampaignInfluencerPerformance & {
          costPerClick: Decimal;
          influencerCurrency: number;
          engagement: Decimal;
          costPerLike: Decimal;
          costPerComment: Decimal;
          costPerEngagement: Decimal;
        }
      > => {
        const campaignInfluencer =
          campaign.platformProductOrder.platformProductOrderInfluencers.find(
            (campaignInfluencer) =>
              campaignInfluencer.influencerId ===
              campaignInfluencerPerformance.influencerId,
          );

        const reachMultiplier =
          campaignInfluencerPerformance.likers.length /
          campaignInfluencerPerformance.likers.filter((liker) => {
            campaignInfluencerPerformance.influencer.influencerFollowers.find(
              (follower) => follower.stakeholderId === liker.stakeholderId,
            );
          }).length;
        const reach =
          reachMultiplier *
          campaignInfluencerPerformance.influencer.influencerFollowers.length;
        const engagementRate =
          (campaignInfluencerPerformance.likes +
            campaignInfluencerPerformance.comments) /
          campaignInfluencerPerformance.influencer.influencerFollowers.length;

        return {
          /* size: campaignInfluencerPerformance.influencer.influencerFollowers
              .length, */
          comments: campaignInfluencerPerformance.comments,
          // * or likers.length
          likes: campaignInfluencerPerformance.likes,
          // * total number of likers divided by a number of likers that are influencr followers
          reach: new Decimal(reach),
          // TODO return reachMultiplier also
          websiteClick: campaignInfluencerPerformance.websiteClick,
          costPerClick: campaignInfluencer.agreedAmount.dividedBy(
            campaignInfluencerPerformance.websiteClick,
          ),
          influencerCurrency: campaignInfluencer.currency,
          engagement: new Decimal(engagementRate),
          costPerLike: campaignInfluencer.agreedAmount.dividedBy(
            campaignInfluencerPerformance.likes,
          ),
          costPerComment: campaignInfluencer.agreedAmount.dividedBy(
            campaignInfluencerPerformance.comments,
          ),
          costPerEngagement: campaignInfluencer.agreedAmount.dividedBy(
            campaignInfluencerPerformance.likes +
              campaignInfluencerPerformance.comments,
          ),
          overlap: undefined,
        };
      },
    );
  }
}
