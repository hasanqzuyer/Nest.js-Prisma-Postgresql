import { Prisma, PrismaClient } from '@prisma/client';

export interface PaginationParams {
  limit: number;
  skip?: number;
  cursor?: any;
}

export interface PaginationMetadata {
  totalItems: number;
  totalFilteredItems: number;
  itemCount: number;
  itemsPerPage: number;
  totalPages: number;
  currentPage: number;
  nextCursor: any;
  [other: string]: any;
}

export interface PaginatedResult<T, U> {
  data: T[];
  dataFormatted?: U[];
  pagination: PaginationMetadata;
}

// helper function to calculate metadata
export function calculatePaginationMetadata(
  params: PaginationParams,
  totalItems: number,
  totalFilteredItems: number,
  data: any[],
): PaginationMetadata {
  const itemCount = data.length > 0 ? data.length - 1 : 0;
  const totalPages = Math.ceil(totalFilteredItems / params.limit);
  const currentPage = params.skip
    ? params.skip / params.limit + 1
    : params.cursor
    ? Math.ceil(itemCount / params.limit) + 1
    : 1;
  // TODO set nextCursor to null if next page doesn't have any records or if current page has less records than limit
  const nextCursor = data.length > 0 ? data[data.length - 1].id : null;

  return {
    totalItems,
    totalFilteredItems,
    itemCount,
    itemsPerPage: params.limit,
    totalPages,
    currentPage,
    nextCursor,
  };
}

export async function getPaginatedResults<
  T extends { where?: any },
  U = any,
  V = any,
>(
  prisma: PrismaClient,
  modelName: Prisma.ModelName,
  findManyArgs: T,
  paginationParams: PaginationParams,
): Promise<PaginatedResult<U, V>> {
  const modelNameCamelCase =
    modelName.charAt(0).toLowerCase() + modelName.slice(1);
  const totalItems = await prisma[modelNameCamelCase].count();
  const totalFilteredItems = findManyArgs.where
    ? await prisma[modelNameCamelCase].count({ where: findManyArgs.where })
    : totalItems;

  const data: U[] = paginationParams.cursor
    ? await prisma[modelNameCamelCase].findMany({
        ...findManyArgs,
        take: paginationParams.limit + 1,
        cursor: paginationParams.cursor,
      })
    : await prisma[modelNameCamelCase].findMany({
        ...findManyArgs,
        // take: paginationParams.limit,
        take: paginationParams.limit + 1,
        skip: paginationParams.skip,
      });

  const pagination = calculatePaginationMetadata(
    paginationParams,
    totalItems,
    totalFilteredItems,
    data,
  );

  /* if (paginationParams.cursor && data.length > paginationParams.limit) {
    data.pop();
  } */
  if (data.length > paginationParams.limit) {
    data.pop();
  }

  return { data, pagination };
}
