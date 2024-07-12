import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/integrations/prisma/prisma.service';
import { CreateChatRoomDto, CreateMessageDto } from './dto';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import securityConfig from 'src/config/security.config';
import { ConfigType } from '@nestjs/config';
import { IUserJwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class ChatService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(securityConfig.KEY)
    private readonly _securityConfig: ConfigType<typeof securityConfig>,
    private readonly jwtService: JwtService,
  ) {}
  platformProductOrderChatRoomIncludeWithLastMessage: Prisma.PlatformProductOrderChatRoomInclude =
    {
      //includes last message, members & productOrder
      productOrderChatRoomMembers: true,
      productOrder: true,
      platformProductOrderChatMessages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { author: true },
      },
    };

  messageTake = 30;

  createMessage(createMessageDto: CreateMessageDto, user: IUserJwtPayload) {
    const { chatRoomId, message } = createMessageDto;
    const authorId = user.id;

    return this.prismaService.platformProductOrderChatMessage.create({
      data: {
        message,
        chatRoom: { connect: { id: chatRoomId } },
        author: { connect: { id: authorId } },
      },

      include: { chatRoom: true, author: true },
    });
  }

  async findChatRoomById(id: number, user: IUserJwtPayload) {
    return await this.prismaService.platformProductOrderChatRoom.findFirstOrThrow(
      {
        where: {
          id,
          productOrderChatRoomMembers: { some: { userId: user.id } }, //only consider chat rooms that the user is member of
        },
        include: this.platformProductOrderChatRoomIncludeWithLastMessage,
      },
    );
  }

  createChatRoom(createRoomDto: CreateChatRoomDto, user: IUserJwtPayload) {
    const { productOrderChatRoomMember, productOrderId, isGroupRoom } =
      createRoomDto;

    if (isGroupRoom && productOrderChatRoomMember === undefined)
      throw new BadRequestException(
        'Group room must have productOrderChatRoomMember!',
      );

    if (!isGroupRoom && productOrderChatRoomMember !== undefined)
      throw new BadRequestException(
        'Private room must not have productOrderChatRoomMember!',
      );

    const membersMap = [
      {
        userId: productOrderChatRoomMember,
      },
      { userId: user.id },
    ];

    return this.prismaService.platformProductOrderChatRoom.create({
      data: {
        productOrder: { connect: { id: productOrderId } },
        isGroupRoom,
        productOrderChatRoomMembers: {
          createMany: { data: membersMap },
        },
      },
      include: {
        productOrderChatRoomMembers: true,
        productOrder: true,
      },
    });
  }

  findChatRoomsByUserId(user: IUserJwtPayload) {
    //includes last message & members
    return this.prismaService.platformProductOrderChatRoom.findMany({
      where: { productOrderChatRoomMembers: { some: { userId: user.id } } },
      include: this.platformProductOrderChatRoomIncludeWithLastMessage,
    });
  }

  findChatMessagesByChatRoomId(
    chatRoomId: number,
    page: number,
    user: IUserJwtPayload,
  ) {
    //gets 50 by 50 messages
    return this.prismaService.platformProductOrderChatMessage.findMany({
      where: {
        chatRoomId,
        chatRoom: {
          // only consider chat rooms that the user is member of
          productOrderChatRoomMembers: { some: { userId: user.id } },
        },
      },
      include: { author: true },
      orderBy: { createdAt: 'desc' },
      skip: page * this.messageTake,
      take: this.messageTake,
    });
  }
}
