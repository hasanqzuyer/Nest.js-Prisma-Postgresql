import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/integrations/prisma/prisma.service';
import { CreateCompanyTitleDto } from './dto';
import { CompanyTitle, Prisma } from '@prisma/client';
import { filterRecordsFactory } from 'src/utils/factories/filter-records.factory';
import { PaginationResult } from 'src/utils/object-definitions/results/pagination-result';
import { FilterParamsDto } from 'src/utils/object-definitions/dtos/filter-params.dto';

@Injectable()
export class CompanyTitleService {
  constructor(private readonly prismaService: PrismaService) {}

  async createCompanyTitles(dto: CreateCompanyTitleDto[]) {
    const companyTitles = dto.map((companyTitle: CreateCompanyTitleDto) => {
      const { name } = companyTitle;
      return {
        name,
      };
    });

    return await this.prismaService.companyTitle.createMany({
      data: companyTitles,
      skipDuplicates: true,
    });
  }

  async findOneById(id: number) {
    return await this.prismaService.companyTitle.findUniqueOrThrow({
      where: { id },
    });
  }

  async findAll({
    skip,
    take,
    sortBy,
    search,
  }: FilterParamsDto): Promise<PaginationResult<CompanyTitle>> {
    const queryWhere: Prisma.CompanyTitleWhereInput = {
      name: { contains: search, mode: 'insensitive' },
    };
    const queryOrderBy: Prisma.Enumerable<Prisma.CompanyTitleOrderByWithRelationInput> =
      (sortBy as any) || { name: 'asc' };

    try {
      return await filterRecordsFactory(
        this.prismaService,
        (tx) => tx.companyTitle,
        {
          where: queryWhere,
          skip,
          take,
          orderBy: queryOrderBy,
        },
      )();
    } catch (error) {
      throw error;
    }
  }

  async deleteOne(id: number) {
    return await this.prismaService.companyTitle.delete({
      where: { id },
    });
  }

  async deleteMany(ids: number[]) {
    return await this.prismaService.companyTitle.deleteMany({
      where: { id: { in: ids } },
    });
  }
}
