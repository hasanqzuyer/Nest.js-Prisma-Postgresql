import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../integrations/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma, User } from '@prisma/client';
import { UserNotFoundException } from './exceptions/user.exception';
import { ContactAdminsDto } from './dto/contact-admins.dto';
import { UserEntity } from './entities/user.entity';
import { UserRole } from 'src/utils';
import { MailService } from 'src/integrations/mail/mail.service';
import { SendgridSender } from 'src/integrations/mail/enums/sender.enum';
import { UpdateUsersStatusDto } from './dto/update-users-status.dto';
import { SocialPlatform } from '../stakeholders/enums/social-platform.enum';
import { DeleteManyUsersDto } from './dto/delete-many-users.dto';
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly mailService: MailService,
  ) {}

  create(createUserDto: CreateUserDto) {
    return 'This action adds a new user';
  }

  findAll() {
    return `This action returns all users`;
  }

  async findOneById(
    id: number,
    throwError = false,
    queryInclude?: Prisma.UserInclude,
  ) {
    const user = await this.prismaService.user.findUnique({
      where: { id },
      include: queryInclude,
    });

    if (throwError && !user) {
      throw new UserNotFoundException({ id });
    }

    return user;
  }

  async findOne(
    { ...properties }: Partial<User>,
    throwError = false,
    queryInclude?: Prisma.UserInclude,
  ) {
    const user = await this.prismaService.user.findFirst({
      where: { ...properties },
      include: queryInclude,
    });
    /* const user = await this.prismaService.user.findUnique({
      where: { ...properties },
      include: queryInclude,
    }); */

    if (throwError && !user) {
      throw new UserNotFoundException({
        id: properties.id,
        email: properties.email,
      });
    }

    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    return await this.prismaService.user.update({
      where: {
        id,
      },
      data: updateUserDto,
    });
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
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

  async deleteMany(dto: DeleteManyUsersDto) {
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

  async contactAdmins(dto: ContactAdminsDto, user: UserEntity) {
    const userRole = user.role;

    const subject = `${dto.topic ? '[' + dto.topic + '] ' : ''}${
      dto.subject
    } - ${user.firstName} ${user.lastName}`;
    let message = '';

    if (dto.topic) message += `<strong>TOPIC:</strong> ${dto.topic}<br><br>`;

    message +=
      `<strong>First name:</strong> ${user.firstName}<br/>` +
      `<strong>Last name:</strong> ${user.lastName}<br/>`;
    // `<strong>Role:</strong> ${ //* obsolete
    //   userRole === UserRole.Client
    //     ? 'CLIENT'
    //     : user.role === UserRole.Ambassador
    //     ? 'AMBASSADOR'
    //     : user.role === UserRole.Influencer
    //     ? 'INFLUENCER'
    //     : '-'
    // }<br/>`;

    if (userRole === UserRole.Influencer) {
      const userInfluencer = await this.prismaService.user.findFirst({
        where: { id: user.id },
        include: {
          influencer: {
            include: {
              stakeholders: true,
            },
          },
        },
      });

      if (
        userInfluencer.influencer.stakeholders.length &&
        userInfluencer.influencer.stakeholders[0].type ===
          SocialPlatform.Instagram
      ) {
        message +=
          `<br /><strong>Social Platform</strong>: Instagram <br />` +
          `<strong>Username</strong>: ${userInfluencer.influencer.stakeholders[0].socialPlatformUsername}<br />`;
      }
    }

    message += `<br /><strong>Message</strong>: ${dto.message} <br />`;

    let recipientEmail;
    if (userRole === UserRole.Client) {
      recipientEmail = SendgridSender.Client;
    } else if (userRole === UserRole.Ambassador) {
      recipientEmail = SendgridSender.Ambassador;
    } else if (userRole === UserRole.Influencer) {
      recipientEmail = SendgridSender.Influencer;
    } else {
      throw new BadRequestException('User role not found!');
    }

    await this.mailService.contactAdmins(
      recipientEmail,
      user.email,
      subject,
      message,
    );
  }

  async updateUsersStatus(updateDto: UpdateUsersStatusDto): Promise<void> {
    const { status, userIds } = updateDto;

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

    await this.prismaService.user.updateMany({
      where: {
        id: { in: userIds },
      },
      data: { status },
    });
  }

  // async getAffiliateLink(id: number) {
  //   try {
  //     const user = await this.prismaService.user.findFirst({
  //       where: {
  //         id,
  //       },
  //       include: {
  //         ambassador: true,
  //         influencer: true,
  //       },
  //     });

  //     const baseUrl = `${this._securityConfig.protocol}://${[
  //       this._securityConfig.appSubdomain,
  //       this._securityConfig.baseDomain,
  //     ]
  //       .filter((s) => !!s)
  //       .join('.')}`;

  //     const affiliateLink = generateAffiliateLink(baseUrl, user);

  //     return { affiliateLink };
  //   } catch (err) {
  //     throw err;
  //   }
  // }
}
