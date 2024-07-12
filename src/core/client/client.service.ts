import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../integrations/prisma/prisma.service';
import { Hash, UserRole, UserStatus } from '../../utils';
import {
  ClientProductsDto,
  ClientRegistrationDto,
  ClientsQueryParamsDto,
} from './dto';
import { ClientRegistrationViaInvitationDto } from './dto';
import { MailService } from '../../integrations/mail/mail.service';
import { throwIfEmailExists } from '../users/exceptions/utils/email-exists';
import {
  Ambassador,
  Client,
  ClientDiseaseArea,
  ClientMarket,
  Company,
  CompanyTitle,
  DiscoverClient,
  DiseaseArea,
  Industry,
  Label,
  Location,
  Prisma,
  Product,
  User,
  UserLabel,
} from '@prisma/client';

import { Legal } from '../common/legals/enums/legal.enum';
import { SendEmailDto } from '../influencer/dto/send-email.dto';
import { PaginationParamsDto } from 'src/utils/object-definitions/dtos/pagination-params.dto';
import {
  DiscoverClientStage,
  DiscoverClientsFilterDto,
} from './dto/filters/discover-clients-filter.dto';
import { ClientsFilterDto } from './dto/filters/clients-filter.dto';
import { addDays } from 'date-fns';
import { PlatformProduct } from 'src/utils/enums/platform.product.enum';
import { Status } from '../campaign/enums';
import {
  AmbassadorTableResponseEntity,
  ClientTableResponseEntity,
  CompanyTableResponseEntity,
  DiseaseAreaTableResponseEntity,
  IndustryTableResponseEntity,
  LabelTableResponseEntity,
  LocationTableResponseEntity,
  MarketTableResponseEntity,
  ProductTableResponseEntity,
  RoleTableResponseEntity,
} from './entities/client-table-response.entity';
import { CreateDiscoverClientDto } from './dto/create-discover-client.dto';
import { ApplicationException } from 'src/exceptions/application.exception';
import { generateInvitationLink } from 'src/utils/generators/invitation-link.generator';
import { ConfigType } from '@nestjs/config';
import { UpdateDiscoverClientDto } from './dto/update-discover-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import securityConfig from 'src/config/security.config';
import { Decimal } from '@prisma/client/runtime';
import { getPaginatedResults } from 'src/utils/prisma/get-paginated-result.util';
import { ClientEntity } from './entities/client.entity';
import { DiscoverClientEntity } from './entities/discover-client.entity';
import { UserEntity } from '../users/entities/user.entity';
import { filterRecordsFactory } from 'src/utils/factories/filter-records.factory';
import { FilterParamsDto } from 'src/utils/object-definitions/dtos/filter-params.dto';
import { LocationService } from '../common/location/location.service';
import { CreateProductDto } from '../common/products/dto/create-product.dto';
import { product } from 'simple-statistics';
import { text } from 'stream/consumers';
import { PaginationResult } from 'src/utils/object-definitions/results/pagination-result';

@Injectable()
export class ClientService {
  private readonly logger = new Logger(ClientService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly mailService: MailService,
    @Inject(securityConfig.KEY)
    private readonly _securityConfig: ConfigType<typeof securityConfig>,
  ) {}

  static readonly queryInclude: Prisma.UserInclude = {
    client: {
      include: {
        company: true,
        companyTitle: true,
        industry: true,
        ambassador: true,
        clientDiseaseAreas: {
          include: {
            diseaseArea: true,
          },
        },
        clientMarkets: {
          include: {
            location: { include: LocationService.queryInclude },
          },
        },
        // clientProducts: true,
        // productOptions: true,
        clientProducts: {
          include: {
            product: true,
          },
        },
        platformProductOrder: {
          include: {
            campaignReports: true,
          },
        },
      },
    },
    location: { include: LocationService.queryInclude },
  };

  async affiliateCodeOwner(affiliateCode: string) {
    return await this.prismaService.ambassador.findFirstOrThrow({
      where: {
        affiliateCode,
      },
    });
  }

  async createDiscoverClient(dto: CreateDiscoverClientDto, user: User) {
    const client = await this.prismaService.client.findFirst({
      where: { user: { email: dto.email } },
    });

    if (client) {
      throw new ApplicationException(
        `Client with an email ${dto.email} already exists`,
      );
    }

    const discoverClient = await this.prismaService.discoverClient.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        company: {
          connectOrCreate: {
            create: {
              name: dto.company?.name,
              createdByUserId:
                user.role === UserRole.SuperAdmin ? user.id : null,
            },
            where: {
              id: dto.company?.companyId,
            },
          },
        },
        // companyTitleId: dto.companyTitleId,
        companyTitle: { connect: { id: dto.companyTitleId } },
        // industryId: dto.industryId,
        industry: { connect: { id: dto.industryId } },
        // locationId: dto.locationId,
        location: { connect: { id: dto.locationId } },
        discoverClientMarkets: {
          connect: dto.marketIds.map((marketId) => ({ id: marketId })),
        },
        discoverClientDiseaseAreas: {
          connect: dto.diseaseAreaIds.map((diseaseAreaId) => ({
            id: diseaseAreaId,
          })),
        },
        status: UserStatus.Identified,
      },
    });

    this.logger.verbose(`Discover client created: ${discoverClient.email}`);

    return discoverClient;
  }

  async register(
    dto: ClientRegistrationDto,
    affiliateCode?: string,
    options?: { language: string },
  ) {
    try {
      const {
        firstName,
        lastName,
        email,
        password,
        companyTitleId,
        company,
        commonLegalId,
      } = dto;

      // * find discover client by an email OR by an invitation token (referral token)
      const discoverClient = await this.prismaService.discoverClient.findFirst({
        where: {
          OR: [
            {
              email,
            },
            {
              invitationToken: affiliateCode,
            },
          ],
        },
        include: {
          discoverClientProducts: true,
          discoverClientMarkets: true,
          discoverClientDiseaseAreas: true,
        },
      });

      // check if legals are in place
      const commonLegalLast = await this.prismaService.legal.findFirstOrThrow({
        where: { type: Legal.Common },
        orderBy: { createdAt: 'desc' },
      });

      /* if (commonLegalLast.id !== commonLegalId) {
        throw new BadRequestException(
          `Legal (${Legal.Common}) is not the newest`,
        );
      } */

      const user = await this.prismaService.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            firstName,
            lastName,
            email,
            password: await Hash(password),
            role: UserRole.Client,
            status: UserStatus.Unconfirmed,
            legalConsents: {
              createMany: {
                data: [
                  {
                    legalId: commonLegalId,
                  },
                ],
              },
            },
            // try to get a data from discover client (if detected)
            // locationId: discoverClient?.locationId,
          },
        });

        let newCompany: Company;

        if (!company.companyId) {
          const existingCompany = await tx.company.findFirst({
            where: { name: company.name },
          });
          if (existingCompany === null) {
            newCompany = await tx.company.create({
              data: {
                name: company.name,
                createdByUser: { connect: { id: user.id } },
              },
            });
          } else {
            newCompany = existingCompany;
          }
        }

        let referent: Ambassador;
        if (affiliateCode !== undefined) {
          referent = await tx.ambassador.findFirstOrThrow({
            where: { affiliateCode },
          });
        }

        await tx.client.create({
          data: {
            user: { connect: { id: user.id } },
            company: company.companyId
              ? { connect: { id: company.companyId } }
              : { connect: { id: newCompany.id } },
            companyTitle: { connect: { id: companyTitleId } },
            // ! referent can be undefined if affiliateCode is from influencer
            ambassador: referent && { connect: { id: referent.id } },
            //#region try to get a data from discover client (if detected)
            /* products: discoverClient?.discoverClientProducts && {
              connect: discoverClient.discoverClientProducts.map((product) => ({
                id: product.productId,
              })),
            },
            industry: discoverClient?.industryId && {
              connect: { id: discoverClient.industryId },
            },
            clientMarkets: discoverClient?.discoverClientMarkets && {
              connect: discoverClient.discoverClientMarkets.map((market) => ({
                id: market.locationId,
              })),
            },
            clientDiseaseAreas: discoverClient?.discoverClientDiseaseAreas && {
              connect: discoverClient.discoverClientDiseaseAreas.map(
                (diseaseArea) => ({
                  id: diseaseArea.diseaseAreaId,
                }),
              ),
            }, */
            //#endregion
          },
          include: { user: true },
        });

        if (discoverClient) {
          await this.prismaService.discoverClient.delete({
            where: { id: discoverClient.id },
          });
        }

        return await tx.user.findFirstOrThrow({
          where: { id: user.id },
          include: ClientService.queryInclude,
        });
      });

      await this.mailService.sendConfirmationEmail(
        user.id,
        user.email,
        user.role,
        user.firstName,
        options.language,
      );

      return user;
    } catch (err) {
      throwIfEmailExists(err);
      throw err;
    }
  }

  async registerViaInvitation(
    dto: ClientRegistrationViaInvitationDto,
    options?: { language: string },
  ) {
    // return this.register(dto as ClientRegistrationDto, dto.affiliateCode);
    try {
      const {
        firstName,
        lastName,
        email,
        password,
        companyTitleId,
        company,
        commonLegalId,
        affiliateCode,
      } = dto;

      // * find discover ambassador by an email OR by an invitation token (referral token)
      this.prismaService.ambassador;
      const discoverAmbassador = await this.prismaService.ambassador.findFirst({
        where: {
          OR: [
            {
              affiliateCode: dto.affiliateCode,
            },
          ],
        },
      });

      // // check if legals are in place
      // const commonLegalLast = await this.prismaService.legal.findFirstOrThrow({
      //   where: { type: Legal.Common },
      //   orderBy: { createdAt: 'desc' },
      // });

      // /* if (commonLegalLast.id !== commonLegalId) {
      //   throw new BadRequestException(
      //     `Legal (${Legal.Common}) is not the newest`,
      //   );
      // } */

      const user = await this.prismaService.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            firstName,
            lastName,
            email,
            password: await Hash(password),
            role: UserRole.Client,
            status: UserStatus.Unconfirmed,
            legalConsents: {
              createMany: {
                data: [
                  {
                    legalId: commonLegalId,
                  },
                ],
              },
            },
            // try to get a data from discover client (if detected)
            // locationId: discoverClient?.locationId,
          },
        });

        let newCompany: Company;

        if (!company.companyId) {
          const existingCompany = await tx.company.findFirst({
            where: { name: company.name },
          });
          if (existingCompany === null) {
            newCompany = await tx.company.create({
              data: {
                name: company.name,
                createdByUser: { connect: { id: user.id } },
              },
            });
          } else {
            newCompany = existingCompany;
          }
        }

        let referent: Ambassador;
        if (affiliateCode !== undefined) {
          referent = await tx.ambassador.findFirstOrThrow({
            where: { affiliateCode },
          });
        }

        await tx.client.create({
          data: {
            user: { connect: { id: user.id } },
            company: company.companyId
              ? { connect: { id: company.companyId } }
              : { connect: { id: newCompany.id } },
            companyTitle: { connect: { id: companyTitleId } },
            // ! referent can be undefined if affiliateCode is from influencer
            ambassador: referent && { connect: { id: referent.id } },
            //#region try to get a data from discover client (if detected)
            /* products: discoverClient?.discoverClientProducts && {
              connect: discoverClient.discoverClientProducts.map((product) => ({
                id: product.productId,
              })),
            },
            industry: discoverClient?.industryId && {
              connect: { id: discoverClient.industryId },
            },
            clientMarkets: discoverClient?.discoverClientMarkets && {
              connect: discoverClient.discoverClientMarkets.map((market) => ({
                id: market.locationId,
              })),
            },
            clientDiseaseAreas: discoverClient?.discoverClientDiseaseAreas && {
              connect: discoverClient.discoverClientDiseaseAreas.map(
                (diseaseArea) => ({
                  id: diseaseArea.diseaseAreaId,
                }),
              ),
            }, */
            //#endregion
          },
          include: { user: true },
        });

        // if (discoverAmbassador) {
        //   await this.prismaService.discoverClient.delete({
        //     where: { id: discoverClient.id },
        //   });
        // }

        return await tx.user.findFirstOrThrow({
          where: { id: user.id },
          include: ClientService.queryInclude,
        });
      });

      await this.mailService.sendConfirmationEmail(
        user.id,
        user.email,
        user.role,
        user.firstName,
        options.language,
      );

      return user;
    } catch (err) {
      throwIfEmailExists(err);
      throw err;
    }
  }

  async filterDiscoverClients(
    { skip, take }: PaginationParamsDto,
    filters: DiscoverClientsFilterDto,
  ) {
    const userStatuses = [];

    if (filters.status !== undefined) userStatuses.push(filters.status);
    if (filters.stage === DiscoverClientStage.Identified)
      userStatuses.push(UserStatus.Identified);
    else if (filters.stage === DiscoverClientStage.Contacted)
      userStatuses.push(UserStatus.Contacted);
    else if (filters.stage === DiscoverClientStage.Registered)
      userStatuses.push(UserStatus.Unconfirmed, UserStatus.Confirmed);
    else if (filters.stage === DiscoverClientStage.Scheduled)
      userStatuses.push(UserStatus.Scheduled);

    // const userSelect: Prisma.DiscoverClientSelect = {
    //   firstName: filters.selectProperties.some(
    //     (p) => p === PropertySelector.FirstName,
    //   ),
    //   lastName: filters.selectProperties.some(
    //     (p) => p === PropertySelector.LastName,
    //   ),
    //   email: filters.selectProperties.some((p) => p === PropertySelector.Email),
    //   /* status: filters.selectProperties.some(
    //     (p) => p === PropertySelector.Status,
    //   ), */
    //   createdAt: filters.selectProperties.some(
    //     (p) => p === PropertySelector.FirstName,
    //   ),
    //   updatedAt: filters.selectProperties.some(
    //     (p) => p === PropertySelector.FirstName,
    //   ),
    //   /* contactedAt: filters.selectProperties.some(
    //     (p) => p === PropertySelector.,
    //   ), */
    //   /* firstName: filters.selectProperties.some(
    //     (p) => p === PropertySelector.FirstName,
    //   ), */
    // };

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
      location:
        filters.locationIds && filters.search
          ? {
              id: filters.locationIds?.length
                ? { in: filters.locationIds }
                : undefined,
              name: filters.search
                ? { contains: filters.search, mode: 'insensitive' }
                : undefined,
            }
          : undefined,
      assigneeUserLabels: {
        ...(filters.hasLabel === true && { some: { id: { not: null } } }),
        ...(filters.hasLabel === false && { none: { id: { not: null } } }),
        ...(filters.labelIds?.length
          ? { some: { labelId: { in: filters.labelIds } } }
          : undefined),
      },
      calendarEventAttendees: {
        ...(filters.hasSchedule === true && { some: { id: { not: null } } }),
        ...(filters.hasSchedule === false && { none: { id: { not: null } } }),
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
    const discoverClientFilterQuery: Prisma.DiscoverClientWhereInput = {
      OR: filters.search
        ? [
            { firstName: { contains: filters.search, mode: 'insensitive' } },
            { lastName: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ]
        : undefined,
      companyTitle: {
        id: filters.roleIds?.length ? { in: filters.roleIds } : undefined,
        name: filters.search
          ? { contains: filters.search, mode: 'insensitive' }
          : undefined,
      },
      company: {
        id: filters.companyIds?.length ? { in: filters.companyIds } : undefined,
        name: filters.search
          ? { contains: filters.search, mode: 'insensitive' }
          : undefined,
      },
      industry: {
        id: filters.industryIds?.length
          ? { in: filters.industryIds }
          : undefined,
        name: filters.search
          ? { contains: filters.search, mode: 'insensitive' }
          : undefined,
      },
      discoverClientMarkets:
        filters.marketIds?.length || filters.search
          ? {
              some: {
                location: {
                  id: filters.marketIds?.length
                    ? { in: filters.marketIds }
                    : undefined,
                  name: filters.search
                    ? { contains: filters.search, mode: 'insensitive' }
                    : undefined,
                },
              },
            }
          : undefined,
      discoverClientDiseaseAreas:
        filters.diseaseAreaIds?.length || filters.search
          ? {
              some: {
                diseaseArea: {
                  id: filters.diseaseAreaIds?.length
                    ? { in: filters.diseaseAreaIds }
                    : undefined,
                  name: filters.search
                    ? { contains: filters.search, mode: 'insensitive' }
                    : undefined,
                },
              },
            }
          : undefined,
      location: {
        id: filters.locationIds?.length
          ? { in: filters.locationIds }
          : undefined,
        name: filters.search
          ? { contains: filters.search, mode: 'insensitive' }
          : undefined,
      },
      status: userStatuses.length ? { in: userStatuses } : undefined,
    };

    const clientFilterQuery: Prisma.ClientWhereInput = {
      platformProductOrder: { none: {} },
      companyTitle: {
        id: filters.roleIds?.length ? { in: filters.roleIds } : undefined,
        name: filters.search
          ? { contains: filters.search, mode: 'insensitive' }
          : undefined,
      },
      company: {
        id: filters.companyIds?.length ? { in: filters.companyIds } : undefined,
        name: filters.search
          ? { contains: filters.search, mode: 'insensitive' }
          : undefined,
      },
      industry: {
        id: filters.industryIds?.length
          ? { in: filters.industryIds }
          : undefined,
        name: filters.search
          ? { contains: filters.search, mode: 'insensitive' }
          : undefined,
      },
      clientMarkets:
        filters.marketIds?.length || filters.search
          ? {
              some: {
                location: {
                  id: filters.marketIds?.length
                    ? { in: filters.marketIds }
                    : undefined,
                  name: filters.search
                    ? { contains: filters.search, mode: 'insensitive' }
                    : undefined,
                },
              },
            }
          : undefined,
      clientDiseaseAreas:
        filters.diseaseAreaIds?.length || filters.search
          ? {
              some: {
                diseaseArea: {
                  id: filters.diseaseAreaIds?.length
                    ? { in: filters.diseaseAreaIds }
                    : undefined,
                  name: filters.search
                    ? { contains: filters.search, mode: 'insensitive' }
                    : undefined,
                },
              },
            }
          : undefined,
      ambassador: {
        ...(filters.hasAmbassador === true && { some: { id: { not: null } } }),
        ...(filters.hasAmbassador === false && { none: { id: { not: null } } }),
        ...(filters.ambassadorIds?.length
          ? { in: filters.ambassadorIds }
          : undefined),
        user: filters.search
          ? {
              OR: [
                {
                  firstName: { contains: filters.search, mode: 'insensitive' },
                },
                { lastName: { contains: filters.search, mode: 'insensitive' } },
                { email: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : undefined,
      },
      products:
        filters.productIds?.length || filters.search
          ? {
              some: {
                id: filters.productIds?.length
                  ? { in: filters.productIds }
                  : undefined,
                name: filters.search
                  ? { in: filters.search, mode: 'insensitive' }
                  : undefined,
              },
            }
          : undefined,
    };

    // if identified or contacted, return discover client
    if (
      userStatuses.includes(UserStatus.Identified) ||
      userStatuses.includes(UserStatus.Contacted)
    ) {
      const clients = await getPaginatedResults<
        Prisma.DiscoverClientFindManyArgs,
        DiscoverClient
      >(
        this.prismaService,
        Prisma.ModelName.DiscoverClient,
        {
          where: {
            ...discoverClientFilterQuery,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            createdAt: true, // "registered at"
            updatedAt: true,
            contactedAt: true,
            company: {
              select: {
                id: true,
                name: true,
              },
            },
            companyTitle: {
              select: {
                id: true,
                name: true,
              },
            },
            industry: {
              select: {
                id: true,
                name: true,
              },
            },
            location: {
              select: {
                id: true,
                name: true,
              },
            },
            discoverClientMarkets: {
              select: {
                location: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            discoverClientDiseaseAreas: {
              select: {
                diseaseArea: {
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

      clients.data = clients.data.map(
        (client) => new DiscoverClientEntity(client),
      );

      return clients;
    }
    // else return client user

    const clients = await getPaginatedResults<
      Prisma.ClientFindManyArgs,
      Client | DiscoverClient
    >(
      this.prismaService,
      Prisma.ModelName.Client,
      {
        where: {
          ...clientFilterQuery,
          user: {
            ...userFilterQuery,
          },
        },
        select: {
          id: true,
          createdAt: true, // "registered at"
          updatedAt: true,
          ambassador: {
            select: {
              id: true,
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
          company: {
            select: {
              id: true,
              name: true,
            },
          },
          companyTitle: {
            select: {
              id: true,
              name: true,
            },
          },
          industry: {
            select: {
              id: true,
              name: true,
            },
          },
          clientMarkets: {
            select: {
              location: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          clientDiseaseAreas: {
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
          user: {
            select: {
              id: true,
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
              firstName: true,
              lastName: true,
              email: true,
              status: true,
              createdAt: true,
              ambassador: true,
              company: true,
            },
          } /* {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          }, */,
        },
      },
      { skip, limit: take },
    );

    clients.data = clients.data.map((client) =>
      new ClientEntity(client).asDiscoverClient(),
    );

    return clients;
  }

  async findAll(
    { skip, take }: PaginationParamsDto,
    filters: ClientsFilterDto,
  ) {
    const userFilterQuery: Prisma.UserWhereInput = {
      OR: filters.search
        ? [
            { firstName: { contains: filters.search, mode: 'insensitive' } },
            { lastName: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ]
        : undefined,
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
        ...(filters.hasLabel === true && { some: { id: { not: null } } }),
        ...(filters.hasLabel === false && { none: { id: { not: null } } }),
        ...(filters.labelIds?.length
          ? { some: { labelId: { in: filters.labelIds } } }
          : undefined),
      },
      calendarEventAttendees: {
        ...(filters.hasSchedule === true && { some: { id: { not: null } } }),
        ...(filters.hasSchedule === false && { none: { id: { not: null } } }),
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
    const clientFilterQuery: Prisma.ClientWhereInput = {
      // if any is not null, his place is NOT in discover clients
      platformProductOrder: {
        some: {
          // platformProduct: filters.project,
          // status:
          //   filters.projectStatus !== undefined
          //     ? filters.projectStatus
          //     : undefined,
        },
      },
      companyTitle: {
        id: filters.roleIds?.length ? { in: filters.roleIds } : undefined,
        name: filters.search
          ? { contains: filters.search, mode: 'insensitive' }
          : undefined,
      },
      company: {
        id: filters.companyIds?.length ? { in: filters.companyIds } : undefined,
        name: filters.search
          ? { contains: filters.search, mode: 'insensitive' }
          : undefined,
      },
      industry: {
        id: filters.industryIds?.length
          ? { in: filters.industryIds }
          : undefined,
        name: filters.search
          ? { contains: filters.search, mode: 'insensitive' }
          : undefined,
      },
      clientMarkets:
        filters.marketIds?.length || filters.search
          ? {
              some: {
                location: {
                  id: filters.marketIds?.length
                    ? { in: filters.marketIds }
                    : undefined,
                  name: filters.search
                    ? { contains: filters.search, mode: 'insensitive' }
                    : undefined,
                },
              },
            }
          : undefined,
      clientDiseaseAreas:
        filters.diseaseAreaIds?.length || filters.search
          ? {
              some: {
                diseaseArea: {
                  id: filters.diseaseAreaIds?.length
                    ? { in: filters.diseaseAreaIds }
                    : undefined,
                  name: filters.search
                    ? { contains: filters.search, mode: 'insensitive' }
                    : undefined,
                },
              },
            }
          : undefined,
      ambassador: {
        ...(filters.hasAmbassador === true && { some: {} }),
        ...(filters.hasAmbassador === false && { none: {} }),
        ...(filters.ambassadorIds?.length
          ? { in: filters.ambassadorIds }
          : undefined),
        user: filters.search
          ? {
              OR: [
                {
                  firstName: { contains: filters.search, mode: 'insensitive' },
                },
                { lastName: { contains: filters.search, mode: 'insensitive' } },
                { email: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : undefined,
      },
      clientProducts:
        filters.productIds?.length || filters.search
          ? {
              some: {
                product: {
                  id: filters.productIds?.length
                    ? { in: filters.productIds }
                    : undefined,
                  name: filters.search
                    ? { in: filters.search, mode: 'insensitive' }
                    : undefined,
                },
              },
            }
          : undefined,
      // ! OLD
      /* productOptions: filters.productIds && {
        some: {
          id: { in: filters.productIds },
          name: { in: filters.search, mode: 'insensitive' },
        },
      }, */
    };

    const clientsWithProjectCount = await this.prismaService.client.findMany({
      where: {
        ...clientFilterQuery,
        user: {
          ...userFilterQuery,
        },
      },
      select: {
        id: true,
        userId: true,
        platformProductOrder: {
          select: {
            id: true,
            createdAt: true,
            campaignReports: true,
          },
        },
      },
    });

    const totalClientProjectsWithBudgetSum =
      await this.prismaService.platformProductOrder.groupBy({
        by: ['clientId'],
        /* _count: {
            _all: true,
          }, */
        _sum: {
          budget: true,
        },
        where: {
          client: {
            ...clientFilterQuery,
            user: {
              ...userFilterQuery,
            },
          },
        },
      });

    let date30DaysAgo = new Date();
    date30DaysAgo.setHours(0, 0, 0, 0);
    date30DaysAgo = addDays(date30DaysAgo, -30);

    const clientsWithMinMaxProjects = clientsWithProjectCount
      .filter(
        (client) => {
          let isMatch = true;

          // * total projects filter
          if (filters.totalProjectsMin !== undefined) {
            isMatch &&=
              filters.totalProjectsMin <= client.platformProductOrder.length;
          }
          if (filters.totalProjectsMax !== undefined) {
            isMatch &&=
              filters.totalProjectsMax >= client.platformProductOrder.length;
          }

          // * projects last 30 days filter
          isMatch ||=
            client.platformProductOrder.find(
              (order) => order.createdAt >= date30DaysAgo,
            ) !== undefined;

          return isMatch;
        },
        /* // * total projects filter
        (filters.totalProjectsMin <= client.platformProductOrder.length &&
          filters.totalProjectsMax >= client.platformProductOrder.length) ||
        // * projects last 30 days filter
        client.platformProductOrder.find(
          (order) => order.createdAt >= date30DaysAgo,
        ), */
      )
      .map((client) => client.id);
    const clientsWithMinMaxBudgetSum = totalClientProjectsWithBudgetSum
      .filter((client) => {
        let isMatch = true;

        if (filters.budgetMin !== undefined) {
          isMatch &&=
            filters.budgetMin &&
            filters.budgetMin <= client._sum.budget.toNumber();
        }
        if (filters.budgetMax !== undefined) {
          isMatch &&=
            filters.budgetMax &&
            filters.budgetMax >= client._sum.budget.toNumber();
        }

        return isMatch;
      })
      .map((client) => client.clientId);
    const clientsWithMinMaxProjectsSet = new Set(clientsWithMinMaxProjects);
    const clientsWithMinMaxBudgetSumSet = new Set(clientsWithMinMaxBudgetSum);
    const clientsMinMaxFiltered = [...clientsWithMinMaxProjectsSet].filter(
      (item) => clientsWithMinMaxBudgetSumSet.has(item),
    );

    const clients = await getPaginatedResults<
      Prisma.ClientFindManyArgs,
      Client & {
        user: User & {
          assigneeUserLabels: (UserLabel & { label: Label })[];
          location: Location & { country: Location };
        };
        ambassador: Ambassador;
        company: Company;
        companyTitle: CompanyTitle;
        industry: Industry;
        clientProducts: { product: Product }[];
        clientMarkets: (ClientMarket & { location: Location })[];
        clientDiseaseAreas: (ClientDiseaseArea & {
          diseaseArea: DiseaseArea & { parentDiseaseArea: DiseaseArea };
        })[];
      }
    >(
      this.prismaService,
      Prisma.ModelName.Client,
      {
        where: {
          ...clientFilterQuery,
          id: { in: clientsMinMaxFiltered },
          user: {
            ...userFilterQuery,
          },
        },
        select: {
          id: true,
          createdAt: true, // "registered at"
          updatedAt: true,
          ambassador: {
            select: {
              id: true,
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
          company: {
            select: {
              id: true,
              name: true,
            },
          },
          companyTitle: {
            select: {
              id: true,
              name: true,
            },
          },
          industry: {
            select: {
              id: true,
              name: true,
            },
          },
          clientMarkets: {
            select: {
              location: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          clientDiseaseAreas: {
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
          clientProducts: {
            select: {
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          platformProductOrder: {
            select: {
              campaignReports: true,
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
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
            },
          },
        },
      },
      { skip, limit: take },
    );

    const clientIds = clients.data.map((client) => client.id);

    const clientCampaignsBudgetSum = await this.getProductBudget(
      clientIds,
      PlatformProduct.Campaign,
    );
    const clientSurveysBudgetSum = await this.getProductBudget(
      clientIds,
      PlatformProduct.Survey,
    );

    const clientSMLsBudgetSum = await this.getProductBudget(
      clientIds,
      PlatformProduct.SML,
    );
    const clientCampaignsLast30DaysBudgetSum = await this.getProductBudget(
      clientIds,
      PlatformProduct.Campaign,
      true,
    );
    const clientSurveysLast30DaysBudgetSum = await this.getProductBudget(
      clientIds,
      PlatformProduct.Survey,
      true,
    );

    const clientSMLsLast30DaysBudgetSum = await this.getProductBudget(
      clientIds,
      PlatformProduct.SML,
      true,
    );
    const clientTotalOngoingProjects = await this.getProductBudget(
      clientIds,
      undefined,
      false,
      true,
    );

    const result = clients.data.map((client) => {
      const campaignsBudgetSum = clientCampaignsBudgetSum.find(
        (budgetResult) => budgetResult.clientId === client.id,
      );
      const surveysBudgetSum = clientSurveysBudgetSum.find(
        (budgetResult) => budgetResult.clientId === client.id,
      );
      const reportBudgetSum = clientSurveysBudgetSum.find(
        (budgetResult) => budgetResult.clientId === client.id,
      );
      const smlsBudgetSum = clientSMLsBudgetSum.find(
        (budgetResult) => budgetResult.clientId === client.id,
      );
      const campaignsLast30DaysBudgetSum =
        clientCampaignsLast30DaysBudgetSum.find(
          (budgetResult) => budgetResult.clientId === client.id,
        );
      const surveysLast30DaysBudgetSum = clientSurveysLast30DaysBudgetSum.find(
        (budgetResult) => budgetResult.clientId === client.id,
      );
      const smlsLast30DaysBudgetSum = clientSMLsLast30DaysBudgetSum.find(
        (budgetResult) => budgetResult.clientId === client.id,
      );
      const totalOngoingProjects = clientTotalOngoingProjects.find(
        (budgetResult) => budgetResult.clientId === client.id,
      );

      const tableClient = new ClientTableResponseEntity({
        id: client.user.id,
        firstName: client.user.firstName,
        lastName: client.user.lastName,
        email: client.user.email,
        registeredAt: client.user.createdAt,
        updatedAt:
          client.updatedAt > client.user.updatedAt
            ? client.updatedAt
            : client.user.updatedAt,
        labels: client.user.assigneeUserLabels.map(
          (label) => new LabelTableResponseEntity(label.label),
        ),
        clientId: client.id,
        ambassador: new AmbassadorTableResponseEntity(client.ambassador),
        company: new CompanyTableResponseEntity(client.company),
        industry: new IndustryTableResponseEntity(client.industry),
        products: client.clientProducts.map(
          (product) => new ProductTableResponseEntity(product.product),
        ),
        location: client.user.location
          ? new LocationTableResponseEntity({
              id: client.user.location.id,
              name: client.user.location.name,
              country:
                client.user.location.country &&
                new LocationTableResponseEntity(client.user.location.country),
            })
          : undefined,
        markets: client.clientMarkets.map(
          (market) => new MarketTableResponseEntity(market.location),
        ),
        diseaseAreas: client.clientDiseaseAreas.map(
          (diseaseArea) =>
            new DiseaseAreaTableResponseEntity({
              id: diseaseArea.diseaseArea.id,
              name: diseaseArea.diseaseArea.name,
              parentDiseaseArea: new DiseaseAreaTableResponseEntity(
                diseaseArea.diseaseArea.parentDiseaseArea,
              ),
            }),
        ),
        role: new RoleTableResponseEntity(client.companyTitle),
        totalBudget: (campaignsBudgetSum?._sum.budget || new Decimal(0))
          .add(surveysBudgetSum?._sum.budget || 0)
          .add(smlsBudgetSum?._sum.budget || 0)
          .toNumber(),
        totalBudgetLast30Days: (
          campaignsLast30DaysBudgetSum?._sum.budget || new Decimal(0)
        )
          .add(surveysLast30DaysBudgetSum?._sum.budget || 0)
          .add(smlsLast30DaysBudgetSum?._sum.budget || 0)
          .toNumber(),
        totalProjects:
          (campaignsBudgetSum?._count._all || 0) +
          (surveysBudgetSum?._count._all || 0) +
          (smlsBudgetSum?._count._all || 0),
        totalOngoingProjects: totalOngoingProjects?._count._all || 0,
        totalProjectsLast30Days:
          (campaignsLast30DaysBudgetSum?._count._all || 0) +
          (surveysLast30DaysBudgetSum?._count._all || 0) +
          (smlsLast30DaysBudgetSum?._count._all || 0),

        averageCampaignBudget: campaignsBudgetSum?._avg.budget?.toNumber() || 0,
        totalCampaignBudget: campaignsBudgetSum?._sum.budget?.toNumber() || 0,
        totalCampaignBudgetLast30Days:
          campaignsLast30DaysBudgetSum?._sum.budget?.toNumber() || 0,
        totalCampaigns: campaignsBudgetSum?._count._all || 0,
        totalCampaignsLast30Days:
          campaignsLast30DaysBudgetSum?._count._all || 0,

        averageSurveyBudget: surveysBudgetSum?._avg.budget?.toNumber() || 0,
        totalSurveyBudget: surveysBudgetSum?._sum.budget.toNumber() || 0,
        totalSurveyBudgetLast30Days:
          surveysLast30DaysBudgetSum?._sum.budget?.toNumber() || 0,
        totalSurveys: surveysBudgetSum?._count._all || 0,
        totalSurveysLast30Days: surveysLast30DaysBudgetSum?._count._all || 0,

        averageSMLBudget: smlsBudgetSum?._avg.budget?.toNumber() || 0,
        totalSMLBudget: smlsBudgetSum?._sum.budget.toNumber() || 0,
        totalSMLBudgetLast30Days:
          smlsLast30DaysBudgetSum?._sum.budget?.toNumber() || 0,
        totalSMLs: smlsBudgetSum?._count._all || 0,
        totalSMLsLast30Days: smlsLast30DaysBudgetSum?._count._all || 0,
      });

      return tableClient;
    });

    clients.data = null;
    clients.dataFormatted = result;

    return clients;
  }

  private async getProductBudget(
    clientIds: number[],
    product?: PlatformProduct,
    last30DaysOnly = false,
    ongoingOnly = false,
  ) {
    let date30DaysAgo = new Date();
    date30DaysAgo.setHours(0, 0, 0, 0);
    date30DaysAgo = addDays(date30DaysAgo, -30);

    return await this.prismaService.platformProductOrder.groupBy({
      by: ['clientId'],
      _count: {
        _all: true, // total campaigns (23)
      },
      _sum: {
        budget: true, // total campaign budget (22)
      },
      _avg: {
        budget: true, // average campaign budget (21)
      },
      where: {
        platformProduct: product,
        client: {
          id: { in: clientIds },
        },
        createdAt: last30DaysOnly
          ? {
              gte: date30DaysAgo,
            }
          : undefined,
        status: ongoingOnly
          ? { in: [Status.InPreparation, Status.OnGoing] }
          : undefined,
      },
    });
  }

  async findOne(id: number) {
    return await this.prismaService.user.findFirstOrThrow({
      where: { id, isDeleted: false, role: UserRole.Client },
      include: ClientService.queryInclude,
    });
  }

  async deleteOne(id: number) {
    return await this.prismaService.user.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async sendEmail(userId: number, { content }: SendEmailDto) {
    // user client
    const user = await this.prismaService.user.findUniqueOrThrow({
      where: { id: userId },
    });

    await this.mailService.sendEmptyClient(user.email, user.firstName, content);
  }

  // * discover client
  // send tracking code (invitation token)
  async inviteClient(discoverClientId: number, { content }: SendEmailDto) {
    const discoverClient =
      await this.prismaService.discoverClient.findUniqueOrThrow({
        where: { id: discoverClientId },
      });

    const baseUrl = `${this._securityConfig.protocol}://${[
      this._securityConfig.appSubdomain,
      this._securityConfig.baseDomain,
    ]
      .filter((s) => !!s)
      .join('.')}`;

    const invitationLink = generateInvitationLink(baseUrl, discoverClient);

    await this.mailService.sendClientInvitation(
      discoverClient.email,
      discoverClient.firstName,
      invitationLink,
      content,
    );
  }

  async updateDiscoverClient(
    discoverClientId: number,
    dto: UpdateDiscoverClientDto,
    user: User,
  ) {
    const {
      firstName,
      lastName,
      email,
      company,
      companyTitleId,
      clientProducts,
      industryId,
      locationId,
      marketIds,
      diseaseAreaIds,
    } = dto;

    return this.prismaService.$transaction(async (tx) => {
      clientProducts &&
        (await this.setDiscoverClientProducts(
          user,
          discoverClientId,
          { clientProducts },
          tx,
        ));
      return await tx.discoverClient.update({
        data: {
          firstName,
          lastName,
          email,
          company: company && {
            connectOrCreate: {
              create: {
                name: company?.name,
                createdByUserId:
                  user.role === UserRole.SuperAdmin ? user.id : null,
              },
              where: {
                id: company?.companyId,
              },
            },
          },
          // companyTitleId: dto.companyTitleId,
          companyTitle: companyTitleId && { connect: { id: companyTitleId } },
          // industryId: dto.industryId,
          industry: industryId && { connect: { id: industryId } },
          // locationId: dto.locationId,
          location: locationId && { connect: { id: locationId } },
          discoverClientMarkets: marketIds && {
            deleteMany: {
              locationId: { notIn: marketIds },
            },
            upsert: marketIds.map((marketId) => ({
              create: { locationId: marketId },
              update: { locationId: marketId },
              where: {
                DiscoverClientLocationIdentifier: {
                  discoverClientId,
                  locationId: marketId,
                },
              },
            })),
          },
          discoverClientDiseaseAreas: diseaseAreaIds && {
            deleteMany: {
              diseaseAreaId: { notIn: diseaseAreaIds },
            },
            upsert: diseaseAreaIds.map((diseaseAreaId) => ({
              create: { diseaseAreaId },
              update: { diseaseAreaId },
              where: {
                DiscoverClientDiseaseAreaIdentifier: {
                  discoverClientId,
                  diseaseAreaId,
                },
              },
            })),
          },
        },
        where: {
          id: discoverClientId,
        },
        include: {
          discoverClientDiseaseAreas: true,
          discoverClientMarkets: true,
          discoverClientProducts: { include: { product: true } },
        },
      });
    });
  }

  async updateClient(userId: number, dto: UpdateClientDto, user: User) {
    const {
      firstName,
      lastName,
      email,
      password,
      company,
      companyTitleId,
      clientProducts,
      industryId,
      locationId,
      marketIds,
      diseaseAreaIds,
      status,
    } = dto;

    const clientUser = await this.prismaService.user.findFirstOrThrow({
      where: { id: userId },
      include: { client: true },
    });

    return this.prismaService.$transaction(async (tx) => {
      if (user.role === UserRole.SuperAdmin || user.role === UserRole.Admin) {
        clientProducts &&
          (await this.setClientProducts(clientUser, { clientProducts }, tx));
      } else {
        clientProducts &&
          (await this.setClientProducts(user, { clientProducts }, tx));
      }

      let newCompany: Company;

      if (!company.companyId) {
        const existingCompany = await tx.company.findFirst({
          where: { name: company.name },
        });
        if (existingCompany === null) {
          newCompany = await tx.company.create({
            data: {
              name: company.name,
              createdByUser: { connect: { id: user.id } },
            },
          });
        } else {
          newCompany = existingCompany;
        }
      }

      return await tx.user.update({
        data: {
          firstName,
          lastName,
          email,
          password: password !== undefined ? await Hash(password) : undefined,
          location: locationId && { connect: { id: locationId } },
          status: status || undefined,
          // * if location can be null even after verification
          /* locationId !== null
            ? locationId !== undefined
              ? { connect: { id: locationId } }
              : undefined
            : { disconnect: true }, */
          client: {
            update: {
              company: company.companyId
                ? { connect: { id: company.companyId } }
                : { connect: { id: newCompany.id } },
              // companyTitleId: dto.companyTitleId,
              companyTitle: companyTitleId && {
                connect: { id: companyTitleId },
              },

              // industryId: dto.industryId,
              industry: industryId && { connect: { id: industryId } },
              clientMarkets: marketIds && {
                deleteMany: {
                  locationId: { notIn: marketIds },
                },
                upsert: marketIds.map((marketId) => ({
                  create: { locationId: marketId },
                  update: { locationId: marketId },
                  where: {
                    ClientMarketIdentifier: {
                      clientId: clientUser.client.id,
                      locationId: marketId,
                    },
                  },
                })),
              },
              clientDiseaseAreas: diseaseAreaIds && {
                deleteMany: {
                  diseaseAreaId: { notIn: diseaseAreaIds },
                },
                upsert: diseaseAreaIds.map((diseaseAreaId) => ({
                  create: { diseaseAreaId },
                  update: { diseaseAreaId },
                  where: {
                    ClientDiseaseAreaIdentifier: {
                      clientId: clientUser.client.id,
                      diseaseAreaId,
                    },
                  },
                })),
              },
            },
          },
        },
        where: {
          id: userId,
        },
        include: ClientService.queryInclude,
      });
    });
  }

  async findClientDiseaseAreas(user: UserEntity) {
    return this.prismaService.diseaseArea.findMany({
      where: {
        clientDiseaseAreas: { some: { clientId: user.client.id } },
      },
    });
  }

  async findRecommendedClientDiseaseAreas(user: UserEntity) {
    return this.prismaService.diseaseArea.findMany({
      where: {
        clientDiseaseAreas: { some: { clientId: user.client.id } },
        platformProductOrderDiseaseAreas: {
          none: { productOrder: { clientId: user.client.id } },
        },
      },
    });
  }

  async findClientProducts(
    user: UserEntity,
    { skip, take, sortBy }: FilterParamsDto,
  ) {
    const queryInclude: Prisma.ClientProductInclude = { product: true };
    const queryOrderBy: Prisma.Enumerable<Prisma.ClientProductOrderByWithRelationInput> =
      (sortBy as any) || { createdAt: 'desc' };
    const queryWhere: Prisma.ClientProductWhereInput = {
      clientId: user.client?.id,
    };

    return filterRecordsFactory(this.prismaService, (tx) => tx.clientProduct, {
      orderBy: queryOrderBy,
      where: queryWhere,
      include: queryInclude,
      skip,
      take,
    })();
  }

  async setClientProducts(
    user: UserEntity,
    body: ClientProductsDto,
    txc?: Omit<
      PrismaService,
      '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
    >,
  ) {
    const { clientProducts } = body;

    return await this.prismaService.$transaction(async (tx) => {
      const createdProductIds = [];
      for (const product of clientProducts) {
        if (product.name) {
          createdProductIds.push(
            (
              await (txc || tx).product.upsert({
                create: {
                  createdByClientId: user.client?.id,
                  name: product.name,
                  clientsWithProduct: { create: { clientId: user.client?.id } },
                },
                update: {},
                where: {
                  name_genericName: { name: product.name, genericName: '' },
                },
                select: { id: true },
              })
            ).id,
          );
        }
      }

      return (
        await (txc || tx).client.update({
          where: { id: user.client?.id },
          data: {
            clientProducts: {
              deleteMany: {
                productId: {
                  notIn: clientProducts
                    .map((product) => {
                      if (product.productId) return product.productId;
                    })
                    .filter((id) => id !== undefined),
                },
              },
              createMany: {
                data: [
                  ...createdProductIds.map((id) => ({
                    productId: id,
                  })),
                  ...clientProducts.map((product) => {
                    if (product.productId)
                      return {
                        productId: product.productId,
                      };
                  }),
                ],
                skipDuplicates: true,
              },
            },
          },
          select: { clientProducts: { include: { product: true } } },
        })
      ).clientProducts;
    });
  }

  async setDiscoverClientProducts(
    user: UserEntity,
    discoverClientId: number,
    body: ClientProductsDto,
    txc?: Omit<
      PrismaService,
      '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
    >,
  ) {
    const { clientProducts } = body;

    return await this.prismaService.$transaction(async (tx) => {
      const createdProductIds = [];
      for (const product of clientProducts) {
        if (product.name) {
          createdProductIds.push(
            (
              await (txc || tx).product.upsert({
                create: {
                  createdByClientId: null,
                  name: product.name,
                  discoverClientsWithProduct: {
                    create: { discoverClientId },
                  },
                },
                update: {},
                where: {
                  name_genericName: { name: product.name, genericName: '' },
                },
                select: { id: true },
              })
            ).id,
          );
        }
      }

      return (
        await (txc || tx).discoverClient.update({
          where: { id: discoverClientId },
          data: {
            discoverClientProducts: {
              deleteMany: {
                productId: {
                  notIn: clientProducts
                    .map((product) => {
                      if (product.productId) return product.productId;
                    })
                    .filter((id) => id !== undefined),
                },
              },
              createMany: {
                data: [
                  ...createdProductIds.map((id) => ({
                    productId: id,
                  })),
                  ...clientProducts.map((product) => {
                    if (product.productId)
                      return {
                        productId: product.productId,
                      };
                  }),
                ],
                skipDuplicates: true,
              },
            },
          },
          select: { discoverClientProducts: { include: { product: true } } },
        })
      ).discoverClientProducts;
    });
  }

  async findAllClients({
    skip,
    take,
    sortBy,
    search,
  }: FilterParamsDto): Promise<PaginationResult<User>> {
    const queryWhere: Prisma.UserWhereInput = {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ],
      role: UserRole.Client,
    };
    const queryInclude: Prisma.UserInclude = {
      client: true,
    };
    // ! queryOrderBy is WIP
    const queryOrderBy: Prisma.Enumerable<Prisma.UserOrderByWithRelationInput> =
      (sortBy as any) || { firstName: 'asc' };

    try {
      const result = await filterRecordsFactory(
        this.prismaService,
        (tx) => tx.user,
        {
          where: queryWhere,
          skip,
          take,
          include: queryInclude,
          orderBy: queryOrderBy,
        },
      )();

      return result;
    } catch (error) {
      throw error;
    }
  }
}
