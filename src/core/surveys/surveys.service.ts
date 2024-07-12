import { Injectable } from '@nestjs/common';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
import { PrismaService } from 'src/integrations/prisma/prisma.service';
import { Status } from '../campaign/enums/status.enum';
import { PlatformProduct } from '../platform-product/enums/platform-product.enum';
import { UserRole } from 'src/utils';
import { ambassadorCommission } from 'src/config';
import { Prisma, User } from '@prisma/client';
import { FilterParamsDto } from 'src/utils/object-definitions/dtos/filter-params.dto';
import { filterRecordsFactory } from 'src/utils/factories/filter-records.factory';
import {
  ApplicationException,
  BadRequestApplicationException,
  ForbiddenApplicationException,
  NotFoundApplicationException,
} from 'src/exceptions/application.exception';
import { ProductOrderInfluencerStatus } from '../platform-product/enums/product-order-influencer-status.enum';
import { UserWithInfluencer } from '../influencer/types';
import { userIdentity } from '../users/utils/user-identity';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateAnswerChoiceDto } from './dto/create-answer-choice.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { UpdateAnswerChoiceDto } from './dto/update-answer-choice.dto';
import { SubmitSurveyResultDto } from './dto/submit-survey-result.dto';
import { SurveyFilterDto } from './dto/survey-filter.dto';
import { UserEntity } from '../users/entities/user.entity';
import { CreditPackage } from './enums/credit-package.enum';
import { DeleteManySurveysDto } from './dto/delete-many-surveys.dto';
import { SurveyInviteInfluencers } from './dto/survey-invite-influencers.dto';
import { FinanceStatus } from '../campaign/enums/finance-status.enum';

@Injectable()
export class SurveysService {
  private readonly surveyQueryIncludeSingle: Prisma.SurveyInclude = {
    products: {
      select: {
        product: true,
      },
    },
    surveyQuestions: true,
    clientSurveyTokenBalances: true,
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
        platformProductOrderDiseaseAreas: {
          select: {
            diseaseArea: true,
          },
        },
        platformProductOrderEthnicities: {
          select: {
            ethnicity: true,
          },
        },
        platformProductOrderGenders: {
          select: {
            gender: true,
          },
        },
        platformProductOrderInterests: {
          select: {
            interest: true,
          },
        },
        platformProductOrderLocations: {
          select: {
            location: {
              include: {
                country: true,
              },
            },
          },
        },
        platformProductOrderStruggles: {
          select: {
            struggle: true,
          },
        },
        platformProductOrderSymptoms: {
          select: {
            symptom: true,
          },
        },
        platformProductOrderLabels: {
          select: {
            label: true,
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
        platformProductOrderLanguages: {
          select: {
            language: true,
          },
        },
      },
    },
  };
  private readonly surveyQueryIncludeMany: Prisma.SurveyInclude = {
    products: true,
    surveyQuestions: true,

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
        platformProductOrderLanguages: {
          select: {
            language: true,
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
  private readonly surveyInfluencersQueryInclude: Prisma.PlatformProductOrderInfluencerInclude =
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

  constructor(private readonly prismaService: PrismaService) {}

  async create(createSurveyDto: CreateSurveyDto, user: UserEntity) {
    const {
      name,
      clientUserId,
      budget,
      currencyId,
      diseaseAreaIds,
      struggleIds,
      symptomIds,
      locationIds,
      languageId,
      ethnicityIds,
      interestIds,
      productIds,
      dateStart,
      dateEnd,
      description,
      participantsCount,
      questionsCount,
      ageMin,
      ageMax,
      genders,
      participantsDescription,
      surveyType,
      exampleImageUrls,
      instructions,
      tokens,
      questionCredits,
      link,
      languages,
      stakeholderTypes,
    } = createSurveyDto;

    if (user.role === UserRole.Client) {
      if (tokens !== undefined) {
        // reference: https://bobbyhadz.com/blog/typescript-get-enum-values-as-array
        const allowedCreditValues = Object.keys(CreditPackage)
          .filter((v) => !isNaN(Number(v)))
          .map((v) => parseInt(v));
        if (!allowedCreditValues.includes(tokens)) {
          throw new BadRequestApplicationException(
            `Number of tokens must have one one of the following values: ${allowedCreditValues.join(
              ', ',
            )}`,
          );
        }
      }
      if (questionCredits !== undefined) {
        throw new BadRequestApplicationException(
          `Only the admin can set question credits.`,
        );
      }
    }

    const productNames = productIds
      ? productIds.filter((item) => typeof item === 'string')
      : [];
    const productNumbers = productIds
      ? productIds.filter((item) => typeof item === 'number')
      : [];

    const newProducts = [];

    if (productNames.length > 0) {
      const userPromise = clientUserId
        ? this.prismaService.user.findFirstOrThrow({
            where: {
              id: clientUserId,
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

    const survey = await this.prismaService.survey.create({
      data: {
        name,
        products: finalProductsIds && {
          createMany: {
            data: finalProductsIds.map((productId) => ({ productId })),
          },
        },
        stakeholderTypes: stakeholderTypes && {
          createMany: {
            data: stakeholderTypes.map((stakeholderType) => ({
              stakeholderType,
            })),
          },
        },
        language: languageId,
        dateStart,
        dateEnd,
        surveyDescription: description,
        participantCount: participantsCount,
        questionCount: questionsCount,
        ageMin,
        ageMax,
        participantsDescription,
        surveyType,
        exampleImages: exampleImageUrls && {
          createMany: {
            data: exampleImageUrls.map((imageUrl) => ({ imageUrl })),
          },
        },
        instructionsDescription: instructions,
        questionCredits,
        link,
        clientSurveyTokenBalances: {
          create: {
            tokenBalance: tokens,
          },
        },
        platformProductOrder: {
          create: {
            platformProduct: PlatformProduct.Survey,
            financeStatus: budget && FinanceStatus.Pending,
            client: {
              connect: {
                userId:
                  user.role === UserRole.Client ? user.client.id : clientUserId,
              },
            },
            ambassadorCommission: ambassadorCommission,
            budget,
            currency: {
              connect: {
                id: currencyId ? currencyId : 1,
              },
            },
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
        ...this.surveyQueryIncludeSingle,
      },
    });

    return survey;
  }

  async findAll(
    { skip, take, sortBy, search }: FilterParamsDto,
    filters: SurveyFilterDto,
    user: UserEntity,
  ) {
    let queryWhere: Prisma.SurveyWhereInput = {
      name: search && { contains: search, mode: 'insensitive' },
      platformProductOrder: {
        status:
          filters.status && filters.status.length
            ? { in: filters.status.map(Number) }
            : undefined,
      },
    };
    const queryOrderBy: Prisma.Enumerable<Prisma.SurveyOrderByWithRelationInput> =
      (sortBy as any) || { createdAt: 'desc' };

    if (user.role === UserRole.Client) {
      queryWhere = {
        ...queryWhere,
        platformProductOrder: {
          client: {
            userId: user.id,
          },
        },
      };
    } else if (user.role === UserRole.Influencer) {
      queryWhere = {
        ...queryWhere,
        platformProductOrder: {
          platformProductOrderInfluencers: {
            some: {
              // influencerId: user.influencer.id,
              influencer: {
                userId: user.id,
              },
            },
          },
        },
      };
    }

    const response = await filterRecordsFactory(
      this.prismaService,
      (tx) => tx.survey,
      {
        where: queryWhere,
        include: this.surveyQueryIncludeMany,
        skip,
        take,
        orderBy: queryOrderBy,
      },
    )();

    return response;
  }

  async findOne(id: number) {
    return await this.prismaService.survey.findUniqueOrThrow({
      where: { id },
      include: {
        ...this.surveyQueryIncludeSingle,
      },
    });
  }

  async update(id: number, updateSurveyDto: UpdateSurveyDto, user: UserEntity) {
    const {
      name,
      budget,
      currencyId,
      clientUserId,
      diseaseAreaIds,
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
      participantsCount,
      questionsCount,
      ageMin,
      ageMax,
      genders,
      participantsDescription,
      surveyType,
      exampleImageUrls,
      instructions,
      tokens,
      questionCredits,
      link,
      status,
      stakeholderTypes,
    } = updateSurveyDto;

    if (user.role === UserRole.Client) {
      if (status !== undefined) {
        // TODO handle with CASL
        throw new ApplicationException(`Can't update status`);
      } else if (questionCredits !== undefined) {
        throw new BadRequestApplicationException(
          `Only the admin can set question credits.`,
        );
      }
    }

    const {
      participantCount: participantCountOld,
      questionCredits: questionCreditsOld,
      platformProductOrderId,
      platformProductOrder: { budget: budgetOld, status: statusOld },
      clientSurveyTokenBalances,
    } = await this.prismaService.survey.findUniqueOrThrow({
      where: { id },
      select: {
        participantCount: true,
        questionCredits: true,
        platformProductOrderId: true,
        platformProductOrder: {
          select: { id: true, budget: true, status: true },
        },
        clientSurveyTokenBalances: true,
      },
    });

    const productNames = productIds.filter((item) => typeof item === 'string');
    const productNumbers = productIds.filter(
      (item) => typeof item === 'number',
    );
    const newProducts = [];

    if (productNames.length > 0) {
      const userPromise = clientUserId
        ? this.prismaService.user.findFirstOrThrow({
            where: {
              id: clientUserId,
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

    const clientTokenBalance =
      clientSurveyTokenBalances && clientSurveyTokenBalances.length
        ? clientSurveyTokenBalances[0]
        : undefined;

    if (
      statusOld !== Status.InPreparation &&
      Object.keys(updateSurveyDto).some(
        (property) => updateSurveyDto[property] !== undefined,
      )
    ) {
      throw new ApplicationException(
        `Can't update survey that is on-going or finished`,
      );
    } else if (budgetOld > budget && user.role === UserRole.Client) {
      // TODO handle with CASL
      throw new ApplicationException(`Can't put budget below current amount`);
    } else if (
      participantCountOld > participantsCount &&
      user.role === UserRole.Client
    ) {
      // TODO handle with CASL
      throw new ApplicationException(
        `Can't put the number of influencers below current number`,
      );
    } else if (
      questionCreditsOld > questionCredits &&
      user.role === UserRole.Client
    ) {
      // TODO handle with CASL
      throw new ApplicationException(
        `Can't put the number of question credits below current number`,
      );
    }

    const survey = await this.prismaService.survey.update({
      where: { id },
      data: {
        name,
        products: finalProductsIds && {
          deleteMany: {
            surveyId: id,
            productId: { notIn: finalProductsIds },
          },
          upsert: finalProductsIds.map((productId) => ({
            create: { productId },
            update: { productId },
            where: {
              SurveyProductIdentifier: {
                surveyId: id,
                productId,
              },
            },
          })),
        },
        stakeholderTypes: stakeholderTypes && {
          deleteMany: {
            surveyId: id,
            stakeholderType: { notIn: stakeholderTypes },
          },
          upsert: stakeholderTypes.map((stakeholderType) => ({
            create: { stakeholderType },
            update: { stakeholderType },
            where: {
              SurveyStakeholderTypeIdentifier: {
                surveyId: id,
                stakeholderType,
              },
            },
          })),
        },
        // language: languageId,
        dateStart,
        dateEnd,
        surveyDescription: description,
        participantCount: participantsCount,
        questionCount: questionsCount,
        ageMin,
        ageMax,
        participantsDescription,
        surveyType,
        link,
        exampleImages: exampleImageUrls && {
          deleteMany: {
            surveyId: id,
            imageUrl: { notIn: exampleImageUrls },
          },
          upsert: exampleImageUrls.map((imageUrl) => ({
            create: { imageUrl },
            update: { imageUrl },
            where: {
              SurveyExampleImageIdentifier: {
                surveyId: id,
                imageUrl,
              },
            },
          })),
        },
        clientSurveyTokenBalances: {
          update: {
            where: {
              id: clientTokenBalance.id,
            },
            data: {
              tokenBalance: tokens,
            },
          },
        },
        instructionsDescription: instructions,
        platformProductOrder: {
          update: {
            ambassadorCommission: ambassadorCommission,
            budget, // TODO client musn't be able to update budget to lower value
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
            status,
          },
        },
      },
      include: {
        ...this.surveyQueryIncludeSingle,
      },
    });

    return survey;
  }

  async remove(id: number) {
    const surveyToken =
      await this.prismaService.clientSurveyTokenBalance.findFirst({
        where: {
          surveyId: id,
        },
      });

    if (surveyToken) {
      await this.prismaService.clientSurveyTokenBalance.delete({
        where: {
          id: surveyToken.id,
        },
      });
    }

    const surveyQuestion = await this.prismaService.surveyQuestion.findFirst({
      where: {
        surveyId: id,
      },
    });

    if (surveyQuestion) {
      await this.prismaService.surveyQuestion.delete({
        where: {
          id: surveyQuestion.id,
        },
      });
    }

    const surveyResponses = await this.prismaService.surveyResponse.findFirst({
      where: {
        surveyId: id,
      },
    });

    if (surveyResponses) {
      await this.prismaService.surveyResponse.delete({
        where: {
          id: surveyResponses.id,
        },
      });
    }

    const surveyProducts = await this.prismaService.product.findMany({
      where: {
        surveyProducts: { some: { surveyId: id } },
      },
    });

    if (surveyProducts) {
      await this.prismaService.surveyProduct.deleteMany({
        where: {
          surveyId: id,
        },
      });
    }

    return await this.prismaService.survey.delete({
      where: { id },
    });
  }

  async removeManySurveys(dto: DeleteManySurveysDto) {
    const { surveyIds } = dto;
    const deletedSurveys = [];
    return this.prismaService.$transaction(async (tx) => {
      for (const surveyId of surveyIds) {
        const surveyTokenToDelete = await tx.clientSurveyTokenBalance.findFirst(
          {
            where: {
              surveyId: surveyId,
            },
          },
        );

        if (surveyTokenToDelete) {
          await this.prismaService.clientSurveyTokenBalance.delete({
            where: {
              id: surveyTokenToDelete.id,
            },
          });
        }

        const surveyQuestion = await tx.surveyQuestion.findFirst({
          where: {
            surveyId: +surveyId,
          },
        });

        if (surveyQuestion) {
          await tx.surveyQuestion.delete({
            where: {
              id: surveyQuestion.id,
            },
          });
        }

        const surveyResponses = await tx.surveyResponse.findFirst({
          where: {
            surveyId: +surveyId,
          },
        });

        if (surveyResponses) {
          await tx.surveyResponse.delete({
            where: {
              id: +surveyResponses.id,
            },
          });
        }

        const surveyProducts = await tx.product.findMany({
          where: {
            surveyProducts: { some: { surveyId: +surveyId } },
          },
        });

        if (surveyProducts) {
          await tx.surveyProduct.deleteMany({
            where: {
              surveyId: +surveyId,
            },
          });
        }

        const deletedSurveyResponses = await tx.survey.deleteMany({
          where: {
            id: +surveyId,
          },
        });

        deletedSurveys.push(deletedSurveyResponses);
      }

      return deletedSurveys;
    });
  }

  //#region INFLUENCER ONBOARD
  async addInfluencers(surveyId: number, influencerIds: number[]) {
    const survey = await this.prismaService.survey.findUniqueOrThrow({
      where: { id: surveyId },
      select: {
        platformProductOrderId: true,
        platformProductOrder: true,
        surveyType: true,
      },
    });

    // ! if influencers FOR EXAMPLE failed in some scenario, there has to be
    // ! a way to add a new influencers instead old ones
    if (survey.platformProductOrder.status >= Status.Finished) {
      throw new ForbiddenApplicationException(
        `Can't add influencer/s after the survey has finished`,
      );
    } else if ([undefined, null].includes(survey.surveyType)) {
      throw new BadRequestApplicationException(
        `Survey has to have survey type defined`,
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
            influencerSurveyAmounts: {
              // it is expected for an influencer to have these settings defined
              where: { surveyType: survey.surveyType },
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
            productOrderId: survey.platformProductOrderId,
            influencerId: userInfluencer.influencer.id,
            agreedAmount:
              userInfluencer.influencer.influencerSurveyAmounts[0]
                .desiredAmount,
            currency: userInfluencer.currency,
            status: ProductOrderInfluencerStatus.Added,
          },
          update: {
            // update agreed amount and currency only, if an influencer is already added
            agreedAmount:
              userInfluencer.influencer.influencerSurveyAmounts[0]
                .desiredAmount,
            currency: userInfluencer.currency,
          },
          where: {
            PlatformProductOrderInfluencerIdentifier: {
              productOrderId: survey.platformProductOrderId,
              influencerId: userInfluencer.influencer.id,
            },
          },
        }),
      ),
    );
  }

  async inviteInfluencers(surveyId: number, dto: SurveyInviteInfluencers) {
    const { influencerIds } = dto;
    const survey = await this.prismaService.survey.findUniqueOrThrow({
      where: { id: surveyId },
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

    const surveyInfluencers =
      survey.platformProductOrder.platformProductOrderInfluencers;
    const userInfluencersNotInSurvey = influencerIds.filter(
      (influencerId) =>
        !surveyInfluencers.find(
          (surveyInfluencer) => surveyInfluencer.influencer.id === influencerId,
        ),
    );
    // check if influencers that are not added or not previously invited, are invited
    // * if the influencer is previously invited, this should trigger repeated invitation
    const surveyInfluencersWithInvalidStatus = surveyInfluencers.filter(
      (surveyInfluencer) =>
        ![
          ProductOrderInfluencerStatus.Added,
          ProductOrderInfluencerStatus.Invited,
        ].includes(surveyInfluencer.status),
    );

    if (userInfluencersNotInSurvey.length) {
      throw new BadRequestApplicationException(
        userInfluencersNotInSurvey.length === 1
          ? `Influencer ${userInfluencersNotInSurvey[0]} is not in the survey ${surveyId}`
          : `Influencers ${userInfluencersNotInSurvey.join(
              ', ',
            )} are not in the survey ${surveyId}`,
      );
    } else if (surveyInfluencersWithInvalidStatus.length) {
      throw new BadRequestApplicationException(
        surveyInfluencersWithInvalidStatus.length === 1
          ? `Influencer ${surveyInfluencersWithInvalidStatus[0]} doesn't have valid state to be invited`
          : `Influencers ${surveyInfluencersWithInvalidStatus.join(
              ', ',
            )} don't have valid state to be invited`,
      );
    }

    return await Promise.all(
      surveyInfluencers.map((surveyInfluencer) =>
        this.prismaService.platformProductOrderInfluencer.update({
          data: { status: ProductOrderInfluencerStatus.Invited },
          where: {
            id: surveyInfluencer.id,
          },
        }),
      ),
    );
  }

  async acceptInvitation(surveyId: number, user: UserWithInfluencer) {
    if (!user.influencer) {
      throw new BadRequestApplicationException(
        `User ${userIdentity(user)} is not an influencer`,
      );
    }

    const survey = await this.prismaService.survey.findUniqueOrThrow({
      where: { id: surveyId },
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

    const surveyInfluencer =
      survey.platformProductOrder.platformProductOrderInfluencers[0];

    if (!surveyInfluencer) {
      throw new BadRequestApplicationException(
        `Influencer ${userIdentity(user)} is not in the survey ${surveyId}`,
      );
    } else if (
      surveyInfluencer.status !== ProductOrderInfluencerStatus.Invited
    ) {
      throw new BadRequestApplicationException(
        `Influencer ${userIdentity(user)} is not invited`,
      );
    }

    return await this.prismaService.platformProductOrderInfluencer.update({
      // * next state is different than in a campaign
      data: { status: ProductOrderInfluencerStatus.ToBeAnswered },
      where: {
        id: surveyInfluencer.id,
      },
    });
  }

  async declineInvitation(surveyId: number, user: UserWithInfluencer) {
    if (!user.influencer) {
      throw new BadRequestApplicationException(
        `User ${userIdentity(user)} is not an influencer`,
      );
    }

    const survey = await this.prismaService.survey.findUniqueOrThrow({
      where: { id: surveyId },
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

    const surveyInfluencer =
      survey.platformProductOrder.platformProductOrderInfluencers[0];

    if (!surveyInfluencer) {
      throw new BadRequestApplicationException(
        `Influencer ${userIdentity(user)} is not in the survey ${surveyId}`,
      );
    } else if (
      surveyInfluencer.status !== ProductOrderInfluencerStatus.Invited
    ) {
      throw new BadRequestApplicationException(
        `Influencer ${userIdentity(user)} is not invited`,
      );
    }

    return await this.prismaService.platformProductOrderInfluencer.update({
      data: { status: ProductOrderInfluencerStatus.Declined },
      where: {
        id: surveyInfluencer.id,
      },
    });
  }
  //#endregion

  //#region INFLUENCER REMOVAL
  async removeInfluencers(surveyId: number, influencerIds: number[]) {
    const survey = await this.prismaService.survey.findUniqueOrThrow({
      where: { id: surveyId },
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
    const surveyInfluencers =
      survey.platformProductOrder.platformProductOrderInfluencers;
    const userInfluencersNotInSurvey = influencerIds.filter(
      (influencerId) =>
        !surveyInfluencers.find(
          (surveyInfluencer) => surveyInfluencer.influencer.id === influencerId,
        ),
    );

    if (userInfluencersNotInSurvey.length) {
      throw new BadRequestApplicationException(
        userInfluencersNotInSurvey.length === 1
          ? `Influencer ${userInfluencersNotInSurvey[0]} is not in the survey ${surveyId}`
          : `Influencers ${userInfluencersNotInSurvey.join(
              ', ',
            )} are not in the survey ${surveyId}`,
      );
    }

    // TODO if survey has started, only admin can remove
    // ! => only admin can put to status REMOVED, not client

    // TODO refactor to return records, not the number of affected records
    const [influencersNotSelected, influencersRemoved] = await Promise.all([
      this.prismaService.platformProductOrderInfluencer.updateMany({
        data: { status: ProductOrderInfluencerStatus.NotSelected },
        where: {
          productOrderId: survey.platformProductOrderId,
          influencerId: { in: influencerIds },
          status: {
            in: [
              ProductOrderInfluencerStatus.Added,
              ProductOrderInfluencerStatus.Invited,
            ],
          },
        },
      }),
      this.prismaService.platformProductOrderInfluencer.updateMany({
        data: { status: ProductOrderInfluencerStatus.Removed },
        where: {
          productOrderId: survey.platformProductOrderId,
          influencerId: { in: influencerIds },
          status: {
            in: [
              // * if status is ADDED|INVITED, next status is NOT SELECTED
              ProductOrderInfluencerStatus.ToBeAnswered,
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

  async removeInfluencerSelf(surveyId: number, user: UserWithInfluencer) {
    if (!user.influencer) {
      throw new BadRequestApplicationException(
        `User ${userIdentity(user)} is not an influencer`,
      );
    }

    const survey = await this.prismaService.survey.findUniqueOrThrow({
      where: { id: surveyId },
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
    const surveyInfluencer =
      survey.platformProductOrder.platformProductOrderInfluencers[0];

    if (
      user.influencer.id !== surveyInfluencer.influencerId ||
      surveyInfluencer.status < ProductOrderInfluencerStatus.Invited
    ) {
      throw new ApplicationException(
        `Influencer ${userIdentity(
          user,
        )} is not in the survey ${surveyId} or is not invited yet`,
      );
    } else if (
      surveyInfluencer.status === ProductOrderInfluencerStatus.Invited
    ) {
      throw new ForbiddenApplicationException(
        `Can't remove itself from the survey if invitation is not accepted, eg. not in the survey`,
      );
    }

    return await this.prismaService.platformProductOrderInfluencer.update({
      data: { status: ProductOrderInfluencerStatus.Withdrawn },
      where: {
        id: surveyInfluencer.id,
      },
    });
  }
  //#endregion

  //#region QUESTION CRUD
  async createQuestion(
    surveyId: number,
    createQuestionDto: CreateQuestionDto,
    includeAnswerChoices = false,
  ) {
    const { questionText, questionType, order, questionCredit } =
      createQuestionDto;

    return await this.prismaService.surveyQuestion.create({
      data: {
        surveyId,
        questionText,
        questionType,
        order,
        questionCredit,
      },
      include: {
        surveyOptions: includeAnswerChoices,
      },
    });
  }

  async getQuestions(surveyId: number, includeAnswerChoices = false) {
    return await this.prismaService.surveyQuestion.findMany({
      where: { surveyId },
      include: {
        surveyOptions: includeAnswerChoices,
      },
    });
  }

  async updateQuestion(
    questionId: number,
    updateQuestionDto: UpdateQuestionDto,
    includeAnswerChoices = false,
  ) {
    const { questionText, questionType, order, questionCredit } =
      updateQuestionDto;

    return await this.prismaService.surveyQuestion.update({
      where: { id: questionId },
      data: {
        questionText,
        questionType,
        order,
        questionCredit,
      },
      include: {
        surveyOptions: includeAnswerChoices,
      },
    });
  }

  async deleteQuestion(questionId: number) {
    return await this.prismaService.surveyQuestion.delete({
      where: { id: questionId },
    });
  }
  //#endregion

  //#region QUESTION ANSWER/S CRUD
  async createAnswerChoice(
    questionId: number,
    createAnswerChoice: CreateAnswerChoiceDto,
  ) {
    const { answer, order } = createAnswerChoice;

    return await this.prismaService.surveyOption.create({
      data: {
        surveyQuestionId: questionId,
        optionText: answer,
        order,
      },
    });
  }

  async getAnswerChoices(questionId: number) {
    return await this.prismaService.surveyOption.findMany({
      where: { surveyQuestionId: questionId },
    });
  }

  async updateAnswerChoice(
    choiceId: number,
    updateAnswerChoice: UpdateAnswerChoiceDto,
  ) {
    const { answer, order } = updateAnswerChoice;

    return await this.prismaService.surveyOption.update({
      where: { id: choiceId },
      data: {
        optionText: answer,
        order,
      },
    });
  }

  async deleteAnswerChoice(choiceId: number) {
    return await this.prismaService.surveyOption.delete({
      where: { id: choiceId },
    });
  }
  //#endregion

  async submitSurveyResult(
    surveyId: number,
    user: UserWithInfluencer,
    data: SubmitSurveyResultDto,
  ) {
    if (!user.influencer) {
      throw new BadRequestApplicationException(
        `User ${userIdentity(user)} is not an influencer`,
      );
    }

    const survey = await this.prismaService.survey.findUniqueOrThrow({
      where: { id: surveyId },
      include: {
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
    const surveyInfluencer =
      survey.platformProductOrder.platformProductOrderInfluencers[0];

    if (
      ![
        ProductOrderInfluencerStatus.ToBeAnswered,
        ProductOrderInfluencerStatus.NotApproved,
      ].includes(surveyInfluencer.status)
    ) {
      throw new ForbiddenApplicationException(
        `Influencer ${userIdentity(
          user,
        )} doesn't have a match (or is already approved) - confirm a result first`,
      );
    }

    return await this.prismaService.$transaction(async (tx) => {
      await tx.platformProductOrderInfluencer.update({
        data: {
          status: ProductOrderInfluencerStatus.ToBeApproved,
        },
        where: {
          id: surveyInfluencer.id,
        },
      });

      return await tx.surveyResponse.upsert({
        create: {
          // TODO review - only the influencers should do surveys???
          userId: user.id,
          surveyId,
          surveyQuestionId: data.surveyQuestionId,
          surveyOptionId: data.surveyOptionId,
          surveyResponseText: data.surveyResponseText,
        },
        update: { surveyResponseText: data.surveyResponseText },
        where: {
          // TODO review if this will work with multi-select questions
          UserSurveyQuestionResponseIdentifier: {
            surveyQuestionId: data.surveyQuestionId,
            surveyOptionId: data.surveyOptionId,
            userId: user.id,
          },
        },
      });
    });
  }

  // * accept
  async approveSurveyResult(surveyId: number, influencerIds: number[]) {
    const survey = await this.prismaService.survey.findUniqueOrThrow({
      where: { id: surveyId },
      include: {
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
          },
        },
      },
    });
    const surveyInfluencers =
      survey.platformProductOrder.platformProductOrderInfluencers;
    const userInfluencersNotInSurvey = influencerIds.filter(
      (influencerId) =>
        !surveyInfluencers.find(
          (surveyInfluencer) =>
            surveyInfluencer.influencer.userId === influencerId,
        ),
    );
    const surveyInfluencersWithInvalidStatus = surveyInfluencers.filter(
      (surveyInfluencer) =>
        ![
          ProductOrderInfluencerStatus.ToBeApproved,
          ProductOrderInfluencerStatus.NotApproved,
        ].includes(surveyInfluencer.status),
    );

    if (userInfluencersNotInSurvey.length) {
      throw new BadRequestApplicationException(
        userInfluencersNotInSurvey.length === 1
          ? `Influencer ${userInfluencersNotInSurvey[0]} is not in the survey ${surveyId}`
          : `Influencers ${userInfluencersNotInSurvey.join(
              ', ',
            )} are not in the survey ${surveyId}`,
      );
    } else if (surveyInfluencersWithInvalidStatus.length) {
      throw new BadRequestApplicationException(
        surveyInfluencersWithInvalidStatus.length === 1
          ? `Influencer ${surveyInfluencersWithInvalidStatus[0]} doesn't have valid state to become approved - force him to submit the survey`
          : `Influencers ${surveyInfluencersWithInvalidStatus.join(
              ', ',
            )} don't have valid state to become approved - force them to submit the survey`,
      );
    }

    return await this.prismaService.platformProductOrderInfluencer.updateMany({
      data: {
        status: ProductOrderInfluencerStatus.Approved,
      },
      where: {
        productOrderId: survey.platformProductOrderId,
      },
    });
  }

  async disapproveSurveyResult(surveyId: number, influencerIds: number[]) {
    const survey = await this.prismaService.survey.findUniqueOrThrow({
      where: { id: surveyId },
      include: {
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
          },
        },
      },
    });
    const surveyInfluencers =
      survey.platformProductOrder.platformProductOrderInfluencers;
    const userInfluencersNotInSurvey = influencerIds.filter(
      (influencerId) =>
        !surveyInfluencers.find(
          (surveyInfluencer) =>
            surveyInfluencer.influencer.userId === influencerId,
        ),
    );
    const surveyInfluencersWithInvalidStatus = surveyInfluencers.filter(
      (surveyInfluencer) =>
        surveyInfluencer.status !== ProductOrderInfluencerStatus.ToBeApproved,
    );

    if (userInfluencersNotInSurvey.length) {
      throw new BadRequestApplicationException(
        userInfluencersNotInSurvey.length === 1
          ? `Influencer ${userInfluencersNotInSurvey[0]} is not in the survey ${surveyId}`
          : `Influencers ${userInfluencersNotInSurvey.join(
              ', ',
            )} are not in the survey ${surveyId}`,
      );
    } else if (surveyInfluencersWithInvalidStatus.length) {
      throw new BadRequestApplicationException(
        surveyInfluencersWithInvalidStatus.length === 1
          ? `Influencer ${surveyInfluencersWithInvalidStatus[0]} doesn't have valid state to become approved - force him to submit the survey`
          : `Influencers ${surveyInfluencersWithInvalidStatus.join(
              ', ',
            )} don't have valid state to become approved - force them to submit the survey`,
      );
    }

    return await this.prismaService.platformProductOrderInfluencer.updateMany({
      data: {
        status: ProductOrderInfluencerStatus.NotApproved,
      },
      where: {
        productOrderId: survey.platformProductOrderId,
      },
    });
  }

  async startSurvey(surveyId: number) {
    const survey = await this.prismaService.survey.findUniqueOrThrow({
      where: { id: surveyId },
      include: {
        platformProductOrder: {
          include: {
            platformProductOrderInfluencers: true,
          },
        },
      },
    });
    const surveyInfluencers =
      survey.platformProductOrder.platformProductOrderInfluencers;

    if (survey.platformProductOrder.status === Status.OnGoing) {
      throw new BadRequestApplicationException(
        `Survey ${surveyId} has already started`,
      );
    } else if (survey.platformProductOrder.status > Status.OnGoing) {
      throw new BadRequestApplicationException(
        `Survey ${surveyId} has finished`,
      );
    } else if (!survey.instructionsDescription) {
      throw new BadRequestApplicationException(
        `Fill the data required: instructions`,
      );
    }

    return await this.prismaService.survey.update({
      data: {
        platformProductOrder: {
          update: {
            status: Status.OnGoing,
          },
        },
      },
      where: {
        id: surveyId,
      },
    });
  }

  async finishSurvey(surveyId: number) {
    const survey = await this.prismaService.survey.findUniqueOrThrow({
      where: { id: surveyId },
      include: { platformProductOrder: true },
    });

    if (survey.platformProductOrder.status !== Status.OnGoing) {
      throw new ForbiddenApplicationException(
        `Survey can't be stopped as it is not started`,
      );
    } else if (survey.platformProductOrder.status > Status.Finished) {
      throw new ForbiddenApplicationException(
        `Survey can't be stopped as it is already finished`,
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

      return await this.prismaService.survey.update({
        data: {
          platformProductOrder: {
            update: {
              status: Status.Finished,
            },
          },
        },
        where: {
          id: surveyId,
        },
      });
    });
  }

  async archiveSurvey(surveyId: number) {
    const survey = await this.prismaService.survey.findUniqueOrThrow({
      where: { id: surveyId },
      include: { platformProductOrder: true },
    });

    if (survey.platformProductOrder.status <= Status.OnGoing) {
      throw new ForbiddenApplicationException(
        `Survey can't be archived as it is not finished`,
      );
    } else if (survey.platformProductOrder.status === Status.Archived) {
      throw new ForbiddenApplicationException(`Survey is already archived`);
    }

    return await this.prismaService.survey.update({
      data: {
        platformProductOrder: {
          update: {
            status: Status.Archived,
          },
        },
      },
      where: {
        id: surveyId,
      },
    });
  }
}
