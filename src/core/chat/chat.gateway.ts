import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsResponse,
} from '@nestjs/websockets';
import { Namespace } from 'socket.io';
import { ChatService } from './chat.service';
import { MessageEntity, PlatformProductOrderChatRoomEntity } from './entity';
import {
  Logger,
  UseFilters,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  CustomWsExceptionFilter,
  PrismaClientErrorFilter,
} from 'src/integrations/socket.io/exceptions';
import { EventNameInterceptor } from 'src/interceptors/websocket';
import {
  CreateChatRoomDto,
  CreateMessageDto,
  FindChatMessagesByChatRoomIdDto,
  JoinRoomDto,
} from './dto';
import { JwtService } from '@nestjs/jwt';
import { TypingDto } from './dto/typing.dto';
import { SocketWithAuth } from 'src/integrations/socket.io/types';

@WebSocketGateway({ namespace: 'chat' })
@UseFilters(PrismaClientErrorFilter, CustomWsExceptionFilter)
@UseInterceptors(EventNameInterceptor)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }),
)
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);
  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
  ) {}

  connectedUsers = [];

  @WebSocketServer()
  ioNamespace: Namespace;

  async afterInit(namespace: Namespace) {
    this.logger.verbose(`Gateway on namespace ${namespace.name} initialized!`);
  }

  async handleConnection(client: SocketWithAuth, ...args: any[]) {
    this.connectedUsers = [
      ...this.connectedUsers,
      { user: client.authPayload.email, clientId: client.id },
    ];
    const sockets = this.ioNamespace.sockets;
    this.logger.log(JSON.stringify(this.connectedUsers));
    this.logger.debug(`Number of connected clients: ${sockets.size}`);
  }

  handleDisconnect(client: SocketWithAuth) {
    client.rooms.forEach((room) => {
      client.to(room).emit('disconnected', {
        user: this.connectedUsers.find((user) => {
          if (user.clientId == client.id) {
            return true;
          }
        }).user,
      });
    });

    const sockets = this.ioNamespace.sockets;

    this.logger.log(`Client with id: ${client.id} disconnected!`);
    this.logger.debug(`Number of connected clients: ${sockets.size}.`);
    this.connectedUsers = this.connectedUsers.filter((user) => {
      if (user.clientId !== client.id) {
        return user;
      }
    });
  }

  @SubscribeMessage('findChatRoomById')
  async findChatRoomById(
    @MessageBody('id') id: number,
    @ConnectedSocket() client: SocketWithAuth,
  ): Promise<WsResponse<PlatformProductOrderChatRoomEntity>> {
    const room = await this.chatService.findChatRoomById(
      id,
      client.authPayload,
    );

    return {
      event: 'findChatRoomById',
      data: new PlatformProductOrderChatRoomEntity(room),
    };
  }

  @SubscribeMessage('createChatRoom')
  async createChatRoom(
    @MessageBody() createRoomDto: CreateChatRoomDto,
    @ConnectedSocket() client: SocketWithAuth,
  ): Promise<WsResponse<PlatformProductOrderChatRoomEntity>> {
    const room = await this.chatService.createChatRoom(
      createRoomDto,
      client.authPayload,
    );

    return {
      event: 'createChatRoom',
      data: new PlatformProductOrderChatRoomEntity(room),
    };
  }

  @SubscribeMessage('sendMessage')
  async createMessage(
    @MessageBody() createMessageDto: CreateMessageDto,
    @ConnectedSocket() client: SocketWithAuth,
  ): Promise<WsResponse<MessageEntity>> {
    const message = new MessageEntity(
      await this.chatService.createMessage(
        createMessageDto,
        client.authPayload,
      ),
    );

    client.to(String(createMessageDto.chatRoomId)).emit('newMessage', message);

    return { event: 'sendMessage', data: message };
  }

  @SubscribeMessage('joinRoom')
  joinRoom(
    @MessageBody()
    joinRoomDto: JoinRoomDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    client.to(String(joinRoomDto.chatRoomId)).emit('joined', {
      event: 'joined',
      data: this.connectedUsers
        .filter((user) => {
          if (user.clientId == client.id) return user.user;
        })
        .pop().user,
    });
    this.logger.log(`joined: ${client.authPayload.email}`);
  }

  @SubscribeMessage('leaveRoom')
  leaveRoom(
    @MessageBody('chatRoomId') chatRoomId: number,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    client.to(String(chatRoomId)).emit('left', {
      event: 'left',
      data: this.connectedUsers
        .filter((user) => {
          if (user.clientId == client.id) return user.user;
        })
        .pop().user,
    });
    client.leave(String(chatRoomId));
  }

  @SubscribeMessage('typing')
  async signalTyping(
    @MessageBody() typingDto: TypingDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    client.to(String(typingDto.chatRoomId)).emit('typing', {
      userName: typingDto.userName,
      isTyping: typingDto.isTyping,
    });
  }

  @SubscribeMessage('findChatRoomsByUserId')
  async findChatRoomsByUserId(
    @ConnectedSocket() client: SocketWithAuth,
  ): Promise<WsResponse<PlatformProductOrderChatRoomEntity[]>> {
    return {
      event: 'findChatRoomsByUserId',
      data: await this.chatService.findChatRoomsByUserId(client.authPayload),
    };
  }

  @SubscribeMessage('findChatMessagesByChatRoomId')
  async findChatMessagesByChatRoomId(
    @MessageBody() findChatMessagesDto: FindChatMessagesByChatRoomIdDto,
    @ConnectedSocket() client: SocketWithAuth,
  ): Promise<WsResponse<MessageEntity[]>> {
    return {
      event: 'findChatRoomsByUserId',
      data: await this.chatService.findChatMessagesByChatRoomId(
        findChatMessagesDto.chatRoomId,
        findChatMessagesDto.page,
        client.authPayload,
      ),
    };
  }
}
