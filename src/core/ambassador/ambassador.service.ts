import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../integrations/prisma/prisma.service';
import { AmbassadorRegistrationDto } from './dto/';
import { Hash, UserRole, UserStatus, generateAffiliateCode } from '../../utils';
import { MailService } from '../../integrations/mail/mail.service';
import { filterRecordsFactory } from 'src/utils/factories/filter-records.factory';
import sendgridConfig from 'src/config/sendgrid.config';
import { ConfigType } from '@nestjs/config';
import { throwIfEmailExists } from '../users/exceptions/utils/email-exists';
import { UpdateAmbassadorDto } from './dto/update-ambassador.dto';
import { Company, Prisma } from '@prisma/client';
import { FilterParamsDto } from 'src/utils/object-definitions/dtos/filter-params.dto';
import { ApplicationException } from 'src/exceptions/application.exception';
import { JsonWebTokenError } from 'jsonwebtoken';
import { AmbassadorTokenPayload } from '../admin/types/ambassador-token-payload.type';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Legal } from '../common/legals/enums/legal.enum';
import lodash from 'lodash';
import { LocationTableResponseEntity } from '../influencer/entities/influencer-table-response.entity';

@Injectable()
export class AmbassadorService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    @Inject(sendgridConfig.KEY)
    private readonly _sendgridConfig: ConfigType<typeof sendgridConfig>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  static queryInclude: Prisma.UserInclude = {
    ambassador: {
      include: {
        company: true,
        companyTitle: true,
        industry: true,
        clients: true,
      },
    },
  };

  async register(
    token: string,
    dto: AmbassadorRegistrationDto,
    options?: { language: string },
  ) {
    try {
      const cache = await this.cacheManager.get(JSON.stringify(token));

      if (cache === undefined)
        throw new BadRequestException('Token timed out!');

      const payload: AmbassadorTokenPayload = this.jwtService.verify(token);

      const {
        firstName,
        lastName,
        email,
        password,
        companyTitleId,
        company,
        commonLegalId,
      } = dto;

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

      const ambassador = await this.prismaService.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            firstName,
            lastName,
            email,
            password: await Hash(password),
            role: UserRole.Ambassador,
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
          },
        });

        let newCompany: Company;

        if (company.companyId === undefined) {
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

        const ambassador = await tx.ambassador.create({
          data: {
            user: { connect: { id: user.id } },
            company: company.companyId
              ? { connect: { id: company.companyId } }
              : { connect: { id: newCompany.id } },
            companyTitle: { connect: { id: companyTitleId } },
            affiliateCode: generateAffiliateCode(),
            invitedByAdmin: { connect: { id: payload.invitedByAdmin } },
          },
          include: { user: true },
        });

        return ambassador;
      });

      await this.cacheManager.del(JSON.stringify(token));

      const user = await this.prismaService.user.findFirst({
        where: { id: ambassador.user.id },
        include: AmbassadorService.queryInclude,
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
      if (error instanceof JsonWebTokenError)
        throw new ApplicationException('Invalid Jwt!');
      throwIfEmailExists(error);
      throw error;
    }
  }

  async findOne(id: number, includeAffiliates = false) {
    try {
      const ambassador = await this.prismaService.user.findFirstOrThrow({
        where: { id, isDeleted: false, role: UserRole.Ambassador },
        include: !includeAffiliates
          ? AmbassadorService.queryInclude
          : lodash.merge<Prisma.UserInclude, Prisma.UserInclude>(
              AmbassadorService.queryInclude,
              {
                ambassador: {
                  include: {
                    clients: { include: { user: true, products: true } },
                  },
                },
              },
            ),
      });

      return ambassador;
    } catch (error) {
      // * can throw PrismaClientKnownRequestError P2025
      throw error;
    }
  }

  async findAll({ skip, take, sortBy }: FilterParamsDto) {
    const queryWhere: Prisma.UserWhereInput = { role: UserRole.Ambassador };
    queryWhere.isDeleted = false;
    const queryInclude: Prisma.UserInclude = lodash.merge<
      Prisma.UserInclude,
      Prisma.UserInclude
    >(AmbassadorService.queryInclude, {
      ambassador: {
        include: {
          clients: { include: { user: true } },
          user: {
            include: {
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
        },
      },
    });
    const queryOrderBy: Prisma.Enumerable<Prisma.UserOrderByWithRelationInput> =
      (sortBy as any) || { createdAt: 'desc' };

    try {
      const result = await filterRecordsFactory(
        this.prismaService,
        (tx) => tx.user,
        {
          where: queryWhere,
          include: queryInclude,
          skip,
          take,
          orderBy: queryOrderBy,
        },
      )();

      const formattedResult = {
        ...result,
        result: result.result.map((ambassador) => {
          return {
            ...ambassador,
            ambassador: {
              ...ambassador.ambassador,
              user: {
                ...ambassador.ambassador.user,
                password: undefined,
                emailResendTokens: undefined,
                isDeleted: undefined,
                role: undefined,
                status: undefined,
                location: ambassador.ambassador.user.location
                  ? new LocationTableResponseEntity({
                      id: ambassador.ambassador.user.location.id,
                      name: ambassador.ambassador.user.location.name,
                      country:
                        ambassador.ambassador.user.location.country &&
                        new LocationTableResponseEntity(
                          ambassador.ambassador.user.location.country,
                        ),
                    })
                  : undefined,
              },
            },
          };
        }),
      };

      return formattedResult;
    } catch (error) {
      throw error;
    }
  }

  async updateOneById(id: number, dto: UpdateAmbassadorDto) {
    const {
      firstName,
      lastName,
      email,
      password,
      locationId,
      currency,
      company,
      companyTitleId,
      industryId,
    } = dto;

    return await this.prismaService.user.update({
      where: { id },
      data: {
        firstName,
        lastName,
        email,
        password,
        locationId,
        currency,
        ambassador: {
          update: { companyTitleId, companyId: company.companyId, industryId },
        },
      },
      include: AmbassadorService.queryInclude,
    });
  }

  async deleteOne(id: number) {
    try {
      return await this.prismaService.user.update({
        where: { id },
        data: { isDeleted: true },
      });
    } catch (error) {
      // * can throw PrismaClientKnownRequestError P2025
      throw error;
    }
  }

  async affiliateCodeOwner(affiliateCode: string) {
    return await this.prismaService.ambassador.findFirstOrThrow({
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
}
