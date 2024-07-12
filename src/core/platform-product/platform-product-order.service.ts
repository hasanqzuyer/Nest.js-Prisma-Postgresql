import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/integrations/prisma/prisma.service';
import { CreatePlatformProductOrderDto } from './dto';
import { PaginationResult } from 'src/utils/object-definitions/results/pagination-result';
import {
  PlatformProductOrder,
  PlatformProductOrderInfluencer,
  Prisma,
} from '@prisma/client';
import { filterRecordsFactory } from 'src/utils/factories/filter-records.factory';
import { FilterParamsDto } from '../../utils/object-definitions/dtos/filter-params.dto';
import { ambassadorCommission } from 'src/config';
import { UpdatePlatformProductOrderDto } from './dto/update-platform-product-order.dto';
import { AddInfluencersDto } from './dto/add-influencers.dto';
import { ClientService } from '../client/client.service';
import { FinanceStatus } from '../campaign/enums/finance-status.enum';
import { ReceivePendingRevenuesDto } from './dto/receive-pending-revenues.dto';
import { ProductOrderInfluencerStatus } from './enums/product-order-influencer-status.enum';
import { ApprovePaymentsDto } from './dto/approve-payments.dto';
import { UserEntity } from '../users/entities/user.entity';
import { UserRole } from 'src/utils';

@Injectable()
export class PlatformProductOrderService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly clientService: ClientService,
  ) {}

  static queryInclude: Prisma.PlatformProductOrderInclude = {
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
        ambassador: {
          select: {
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
    // platformProduct: true,
    platformProductOrderLocations: { include: { location: true } },
    platformProductOrderDiseaseAreas: { include: { diseaseArea: true } },
    platformProductOrderInterests: { include: { interest: true } },
    platformProductOrderEthnicities: { include: { ethnicity: true } },
    platformProductOrderStruggles: { include: { struggle: true } },

    campaigns: true,
    surveys: true,
    currency: true,
  };

  static querySelect: Prisma.PlatformProductOrderSelect = {
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
        ambassador: {
          select: {
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
    platformProductOrderLocations: { select: { id: true, location: true } },
    platformProductOrderDiseaseAreas: {
      select: { id: true, diseaseArea: true },
    },
    platformProductOrderInterests: { select: { id: true, interest: true } },
    platformProductOrderEthnicities: { select: { id: true, ethnicity: true } },
    platformProductOrderStruggles: { select: { id: true, struggle: true } },
    id: true,
    ambassadorCommission: true,
    budget: true,
    currency: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  };

  static queryIncludeInfluencer: Prisma.PlatformProductOrderInfluencerInclude =
    {
      influencer: {
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
      productOrder: {
        include: {
          campaigns: true,
          surveys: true,
          currency: true,
        },
      },
    };

  async addInfluencers(dto: AddInfluencersDto) {
    return await this.prismaService
      .$transaction(async (tx) => {
        const user = tx.user.findFirstOrThrow({
          where: { influencer: { id: dto.influencerId } },
        });

        const campaignAmount = tx.influencerCampaignAmount.findFirstOrThrow({
          where: { influencerId: dto.influencerId },
        });

        return await Promise.all([user, campaignAmount]).then(
          async ([user, campaignAmount]) => {
            return tx.platformProductOrderInfluencer.create({
              data: {
                productOrderId: dto.productOrderId,
                influencerId: dto.influencerId,
                agreedAmount: campaignAmount.desiredAmount,
                currency: user.currency,
                status: user.status,
              },
            });
          },
        );
      })
      .catch((err) => {
        throw new ConflictException('Already Exists');
      });
  }

  async createPlatformProductOrder(
    dto: CreatePlatformProductOrderDto,
    tx?: Omit<
      PrismaService,
      '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
    >,
  ) {
    const {
      clientId,
      platformProduct,
      // currency,
      budget,
      locations,
      diseaseAreas,
      interests,
      ethnicities,
      struggles,
      status,
    } = dto;

    // await this.clientService.findOne(userId); //! WTF IS THIS?

    const generateCreateManyData = <T>(arr: number[], field: string): T => {
      const map = arr
        ? arr.map((id) => {
            return {
              [field]: id,
            };
          })
        : [];

      return {
        createMany: { data: map, skipDuplicates: true },
      } as T;
    };

    return await (tx || this.prismaService).platformProductOrder.create({
      data: {
        client: { connect: { id: clientId } },
        // ! OLD platformProduct: { connect: { id: platformProduct } },
        platformProduct,
        ambassadorCommission: new Prisma.Decimal(ambassadorCommission),
        budget: budget && new Prisma.Decimal(budget),
        // TODO review currency: currency,
        platformProductOrderLocations: generateCreateManyData(
          locations,
          'locationId',
        ),
        platformProductOrderDiseaseAreas: generateCreateManyData(
          diseaseAreas,
          'diseaseAreaId',
        ),
        platformProductOrderEthnicities: generateCreateManyData(
          ethnicities,
          'ethnicityId',
        ),
        platformProductOrderInterests: generateCreateManyData(
          interests,
          'interestId',
        ),

        platformProductOrderStruggles: generateCreateManyData(
          struggles,
          'struggleId',
        ),
        status,
      },
      include: PlatformProductOrderService.queryInclude,
    });
  }

  async findPlatformProductCampaign(id: number, user: UserEntity) {
    const platformProductCampaigns = await this.prismaService.campaign.findMany(
      {
        where: { platformProductOrderId: id },
        include: {
          platformProductOrder: {
            select: {
              id: true,
              platformProduct: true,
              clientId: true,
              status: true,
              currencyId: true,
            },
          },
        },
      },
    );
    return platformProductCampaigns[0];
  }

  async findPlatformProductSurvey(id: number, user: UserEntity) {
    const platformProductSurvey = await this.prismaService.survey.findMany({
      where: { platformProductOrderId: id },
      include: {
        platformProductOrder: {
          select: {
            id: true,
            platformProduct: true,
            clientId: true,
            status: true,
            currencyId: true,
          },
        },
      },
    });
    return platformProductSurvey[0];
  }

  async findAll({
    take,
    skip,
    sortBy,
  }: FilterParamsDto): Promise<PaginationResult<PlatformProductOrder>> {
    // ! queryOrderBy is WIP
    const queryOrderBy: Prisma.Enumerable<Prisma.PlatformProductOrderOrderByWithRelationInput> =
      // sort by comment time (descending) by the default
      (sortBy as any) || { createdAt: 'desc' };

    const res = await filterRecordsFactory(
      this.prismaService,
      (tx) => tx.platformProductOrder,
      {
        include: PlatformProductOrderService.queryInclude,
        skip,
        take,
        orderBy: queryOrderBy,
      },
    )();
    return res;
  }

  async findOneById(id: number) {
    try {
      return await this.prismaService.platformProductOrder.findFirstOrThrow({
        where: { id },
        include: PlatformProductOrderService.queryInclude,
      });
    } catch (error) {
      throw error;
    }
  }

  async findOneByIdInfluencersCampaing(
    { skip, take }: FilterParamsDto,
    id: number,
    user: UserEntity,
  ) {
    try {
      const queryWhere: Prisma.PlatformProductOrderInfluencerWhereInput = {
        productOrder: {
          id: id,
        },
        // name: search && { contains: search, mode: 'insensitive' },
        // platformProductOrder: {
        //   platformProductOrderInfluencers:
        //     user.role === UserRole.Influencer
        //       ? {
        //           some: {
        //             // influencerId: user.influencer.id,
        //             influencer: {
        //               userId: user.id,
        //             },
        //           },
        //         }
        //       : undefined,
        // },
      };

      const campaing = await this.prismaService.campaign.findFirstOrThrow({
        where: {
          platformProductOrderId: id,
        },
        select: {
          id: true,
        },
      });

      const include: Prisma.PlatformProductOrderInfluencerInclude = {
        influencer:
          user.role === UserRole.SuperAdmin ||
          user.role === UserRole.Admin ||
          user.role === UserRole.Client
            ? {
                include: {
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                      status: true,
                    },
                  },
                  stakeholders: true,
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
                  campaignInfluencerPerformances: {
                    where: {
                      campaignId: campaing.id,
                    },
                  },
                },
              }
            : undefined,
      };

      const platformInfluencers = await filterRecordsFactory(
        this.prismaService,
        (tx) => tx.platformProductOrderInfluencer,
        {
          where: queryWhere,
          include: include,
          skip,
          take,
        },
      )();

      if (user.role === UserRole.Client) {
        const modifiedInfluencers = platformInfluencers.result.map(
          (influencer, index) => {
            const { agreedAmount, ...restInfluencer } = influencer;
            if (influencer.status !== ProductOrderInfluencerStatus.Matching) {
              return {
                ...restInfluencer,
                influencer: {
                  ...restInfluencer.influencer,
                  stakeholders: [
                    {
                      ...restInfluencer.influencer.stakeholders[0],
                      socialPlatformUserId: undefined,
                      socialPlatformUsername: `Influencer ${index + 1}`,
                      iv: undefined,
                      bio: undefined,
                      type: undefined,
                      isRegistered: undefined,
                      influencerId: undefined,
                      locationId: undefined,
                      dateOfBirth: undefined,
                    },
                  ],
                  user: {
                    ...restInfluencer.influencer.user,
                    firstName: '',
                    lastName: undefined,
                    email: undefined,
                  },
                },
              };
            } else {
              return restInfluencer;
            }
          },
        );

        platformInfluencers.result = modifiedInfluencers;
      }

      return platformInfluencers;
    } catch (error) {
      throw error;
    }
  }

  async findOneByIdInfluencersSurvey(
    { skip, take }: FilterParamsDto,
    id: number,
    user: UserEntity,
  ) {
    try {
      const queryWhere: Prisma.PlatformProductOrderInfluencerWhereInput = {
        productOrder: {
          id: id,
        },
        // name: search && { contains: search, mode: 'insensitive' },
        // platformProductOrder: {
        //   platformProductOrderInfluencers:
        //     user.role === UserRole.Influencer
        //       ? {
        //           some: {
        //             // influencerId: user.influencer.id,
        //             influencer: {
        //               userId: user.id,
        //             },
        //           },
        //         }
        //       : undefined,
        // },
      };

      const include: Prisma.PlatformProductOrderInfluencerInclude = {
        influencer:
          user.role === UserRole.SuperAdmin ||
          user.role === UserRole.Admin ||
          user.role === UserRole.Client
            ? {
                include: {
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                      status: true,
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
                  stakeholders: true,
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
                },
              }
            : undefined,
      };

      const platformInfluencers = await filterRecordsFactory(
        this.prismaService,
        (tx) => tx.platformProductOrderInfluencer,
        {
          where: queryWhere,
          include: include,
          skip,
          take,
        },
      )();

      if (user.role === UserRole.Client) {
        const modifiedInfluencers = platformInfluencers.result.map(
          (influencer, index) => {
            const { agreedAmount, ...restInfluencer } = influencer;
            if (influencer.status !== ProductOrderInfluencerStatus.Matching) {
              return {
                ...restInfluencer,
                influencer: {
                  ...restInfluencer.influencer,

                  stakeholders: [
                    {
                      ...restInfluencer.influencer.stakeholders[0],
                      socialPlatformUserId: undefined,
                      socialPlatformUsername: `Participant ${index + 1}`,
                      iv: undefined,
                      bio: undefined,
                      type: undefined,
                      isRegistered: undefined,
                      influencerId: undefined,
                      locationId: undefined,
                      dateOfBirth: undefined,
                    },
                  ],
                  user: {
                    ...restInfluencer.influencer.user,
                    firstName: '',
                    lastName: undefined,
                    email: undefined,
                    // location: undefined,
                  },
                },
              };
            } else {
              return restInfluencer;
            }
          },
        );

        platformInfluencers.result = modifiedInfluencers;
      }

      return platformInfluencers;
    } catch (error) {
      throw error;
    }
  }

  async updateOneById(
    id: number,
    dto: UpdatePlatformProductOrderDto,
    tx?: Omit<
      PrismaService,
      '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
    >,
  ) {
    if (tx) {
      return await this.updateTransact(id, dto, tx);
    }

    return await this.prismaService.$transaction(
      async (newTx) => await this.updateTransact(id, dto, newTx),
    );
  }

  private async updateTransact(
    productOrderId: number,
    dto: UpdatePlatformProductOrderDto,
    tx: Omit<
      PrismaService,
      '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
    >,
  ) {
    const {
      // currency,
      budget,
      locations,
      diseaseAreas,
      interests,
      ethnicities,
      struggles,
      financeStatus,
    } = dto;

    const generateDeleteManyAndCreateMany = (
      condition: number[],
      connectOrCreateField: string,
    ) => {
      const map = condition
        ? condition.map((id) => {
            return {
              [connectOrCreateField]: id,
            };
          })
        : [];

      // const map = (condition || []).map((id) => ({
      //   [connectOrCreateField]: id,
      // }));

      return {
        ...(condition !== undefined
          ? condition !== null
            ? {
                deleteMany: {
                  NOT: { [connectOrCreateField]: { in: condition } },
                },
                createMany: { data: map, skipDuplicates: true },
              }
            : { deleteMany: { productOrderId } }
          : {}),
      };
    };

    return await tx.platformProductOrder.update({
      where: { id: productOrderId },
      data: {
        // TODO review currency,
        budget,
        financeStatus,
        platformProductOrderLocations: generateDeleteManyAndCreateMany(
          locations,
          'locationId',
        ),
        platformProductOrderEthnicities: generateDeleteManyAndCreateMany(
          ethnicities,
          'ethnicityId',
        ),
        platformProductOrderDiseaseAreas: generateDeleteManyAndCreateMany(
          diseaseAreas,
          'diseaseAreaId',
        ),
        platformProductOrderInterests: generateDeleteManyAndCreateMany(
          interests,
          'interestId',
        ),
        platformProductOrderStruggles: generateDeleteManyAndCreateMany(
          struggles,
          'struggleId',
        ),
      },
      include: PlatformProductOrderService.queryInclude,
    });
  }

  async findAllByFinanceStatus(
    { take, skip, sortBy }: FilterParamsDto,
    financeStatus: FinanceStatus,
  ): Promise<PaginationResult<PlatformProductOrder>> {
    const queryOrderBy: Prisma.Enumerable<Prisma.PlatformProductOrderOrderByWithRelationInput> =
      (sortBy as any) || { createdAt: 'desc' };

    const queryWhere: Prisma.PlatformProductOrderWhereInput = {
      financeStatus,
    };

    const res = await filterRecordsFactory(
      this.prismaService,
      (tx) => tx.platformProductOrder,
      {
        include: PlatformProductOrderService.queryInclude,
        skip,
        take,
        orderBy: queryOrderBy,
        where: queryWhere,
      },
    )();
    return res;
  }

  async receivePendingRevenues(dto: ReceivePendingRevenuesDto) {
    const { productIds } = dto;
    try {
      const existingOrders =
        await this.prismaService.platformProductOrder.findMany({
          where: {
            id: { in: productIds },
          },
          select: {
            id: true,
          },
        });

      const existingOrderIds = existingOrders.map((order) => order.id);
      const missingOrderIds = productIds.filter(
        (id) => !existingOrderIds.includes(id),
      );

      if (missingOrderIds.length > 0) {
        throw new ConflictException(
          `Product order with id ${missingOrderIds.join(', ')} does not exist`,
        );
      }

      const updatedOrders = await this.prismaService.$transaction(
        existingOrderIds.map((id) =>
          this.prismaService.platformProductOrder.update({
            where: { id },
            data: { financeStatus: FinanceStatus.Received },
          }),
        ),
      );

      return updatedOrders;
    } catch (error) {
      throw error;
    }
  }

  async findAllApprovedAgreedAmounts({
    take,
    skip,
    sortBy,
  }: FilterParamsDto): Promise<
    PaginationResult<PlatformProductOrderInfluencer>
  > {
    const queryWhere: Prisma.PlatformProductOrderInfluencerWhereInput = {
      status: {
        in: [
          ProductOrderInfluencerStatus.ToBePaid,
          ProductOrderInfluencerStatus.Paid,
          ProductOrderInfluencerStatus.Declined,
        ],
      },
    };

    const queryOrderBy: Prisma.Enumerable<Prisma.PlatformProductOrderInfluencerOrderByWithRelationInput> =
      (sortBy as any) || { createdAt: 'desc' };

    const res = await filterRecordsFactory(
      this.prismaService,
      (tx) => tx.platformProductOrderInfluencer,
      {
        include: PlatformProductOrderService.queryIncludeInfluencer,
        skip,
        take,
        orderBy: queryOrderBy,
        where: queryWhere,
      },
    )();

    return res;
  }

  async updatePlatformProductPayments(dto: ApprovePaymentsDto) {
    const { paymentIds, status } = dto;

    try {
      const existingPayments =
        await this.prismaService.platformProductOrderInfluencer.findMany({
          where: {
            id: { in: paymentIds },
            status: {
              in: [
                ProductOrderInfluencerStatus.Declined,
                ProductOrderInfluencerStatus.ToBePaid,
                ProductOrderInfluencerStatus.Paid,
              ],
            },
          },
          select: {
            id: true,
          },
        });

      const existingPaymentIds = existingPayments.map((payment) => payment.id);
      const missingPaymentIds = paymentIds.filter(
        (id) => !existingPaymentIds.includes(id),
      );

      if (missingPaymentIds.length > 0) {
        throw new ConflictException(
          `Payment with id ${missingPaymentIds.join(', ')} does not exist`,
        );
      }

      const updatedPayments = await this.prismaService.$transaction(
        existingPaymentIds.map((id) =>
          this.prismaService.platformProductOrderInfluencer.update({
            where: { id },
            data: { status },
          }),
        ),
      );

      return updatedPayments;
    } catch (error) {
      throw error;
    }
  }
}
