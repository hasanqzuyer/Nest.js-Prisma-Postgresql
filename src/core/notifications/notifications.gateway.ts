import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace } from 'socket.io';
import { NotificationsService } from './notifications.service';
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
import { SocketWithAuth } from 'src/integrations/socket.io/types';

@WebSocketGateway({ namespace: 'notifications' })
@UseFilters(PrismaClientErrorFilter, CustomWsExceptionFilter)
@UseInterceptors(EventNameInterceptor)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }),
)
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);
  constructor(private readonly notificationsService: NotificationsService) {}

  @WebSocketServer()
  ioNamespace: Namespace;

  afterInit(namespace: Namespace) {
    this.notificationsService.socket = namespace;
    this.logger.log(`Gateway on namespace ${namespace.name} initialized!`);
  }

  handleConnection(client: SocketWithAuth) {
    client.join(client.authPayload.id.toString());
    this.logger.log(`Client with user id: ${client.authPayload.id} connected!`);
  }

  handleDisconnect(client: SocketWithAuth) {
    client.leave(client.authPayload.id.toString());
    this.logger.log(
      `Client with user id: ${client.authPayload.id} disconnected!`,
    );
  }
}
