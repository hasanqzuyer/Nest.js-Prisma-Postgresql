import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/integrations/prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { Namespace } from 'socket.io';
import { NotificationType, NotificationTypeToName, UserRole } from 'src/utils';
import { NotificationEntity } from './entities';
import { plainToClass } from 'class-transformer';

@Injectable()
export class NotificationsService {
  constructor(private readonly prismaService: PrismaService) {}

  public socket: Namespace = null;

  async getAllAdminIndexes() {
    const admins = await this.prismaService.user.findMany({
      where: {
        role: UserRole.Admin,
      },
    });
    return admins.map((a) => a.id);
  }

  async createNotification(dto: CreateNotificationDto) {
    const {
      title,
      description,
      type,
      link,
      variant,
      notificationUsers,
      notificationPayload,
    } = dto;

    const payload =
      typeof notificationPayload === 'object' &&
      !!Object.keys(notificationPayload).length
        ? { create: notificationPayload }
        : undefined;

    const notification = await this.prismaService.notification.create({
      data: {
        title,
        description,
        type,
        link,
        variant,
        notificationUsers: {
          createMany: {
            data: notificationUsers.map((userId) => ({
              userId,
            })),
          },
        },
        notificationPayload: payload,
      },
      include: {
        notificationPayload: {
          include: {
            user: true,
            admin: { include: { admin: true } },
            ambassador: { include: { ambassador: true } },
            influencer: { include: { influencer: true } },
            client: { include: { client: true } },
            calendarEvent: true,
            campaign: true,
            platformProductOrder: true,
            socialMediaListening: true,
            survey: true,
            transaction: true,
            transactionFlow: true,
            campaignReport: true,
          },
        },
      },
    });

    const eventName = NotificationTypeToName(type);

    const formattedNotification = plainToClass(
      NotificationEntity,
      notification,
      {
        excludeExtraneousValues: true,
        enableImplicitConversion: true,
        exposeUnsetFields: false,
      },
    );

    this.socket
      .in(notificationUsers.map((u) => u.toString()))
      .emit(eventName, formattedNotification);

    return formattedNotification;
  }

  async clientICRegistered(clientId: number) {
    const notification = await this.createNotification({
      title: 'Client Registered (CI)',
      description: `New client has been registered (From contacted/identified)`,
      type: NotificationType.ClientICRegistered,
      variant: 'info',
      notificationPayload: { clientId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async clientRegistered(clientId: number) {
    const notification = await this.createNotification({
      title: 'Client Registered',
      description: 'New client has been registered',
      type: NotificationType.ClientRegistered,
      variant: 'info',
      notificationPayload: { clientId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async clientStatusUnchanged(clientId: number, days: number) {
    const adminNotification = await this.createNotification({
      title: 'Client Status Unchanged',
      description: `Client status hasn't been changed for ${days} days`,
      type: NotificationType.ClientStatusUnchanged,
      variant: 'warning',
      notificationPayload: { clientId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    const clientNotification = await this.createNotification({
      title: 'Status Unchanged',
      description: `Your status hasn't been changed for ${days} days`,
      type: NotificationType.ClientStatusUnchanged,
      variant: 'warning',
      notificationPayload: { clientId },
      notificationUsers: [clientId],
    });

    return { adminNotification, clientNotification };
  }

  async clientOrderCreated(clientId: number, platformProductOrderId: number) {
    const notification = await this.createNotification({
      title: 'New Order',
      description: 'Client made new platform product order',
      type: NotificationType.ClientOrderCreated,
      variant: 'info',
      notificationPayload: { clientId, platformProductOrderId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async clientEmailUnverified(userId: number, days: number) {
    const notification = await this.createNotification({
      title: 'Client Email Unverified',
      description: `Client hasn't verified their email for ${days} days`,
      type: NotificationType.ClientEmailUnverified,
      variant: 'warning',
      notificationPayload: { userId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async influencerRegistered(influencerId: number) {
    const notification = await this.createNotification({
      title: 'Influencer Registered',
      description: 'New influencer has been registered',
      type: NotificationType.InfluencerRegistered,
      variant: 'info',
      notificationPayload: { influencerId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async influencerVerified(influencerId: number) {
    const notification = await this.createNotification({
      title: 'Influencer Verified',
      description: 'Influencer has verified their account',
      type: NotificationType.InfluencerVerified,
      variant: 'success',
      notificationPayload: { influencerId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async influencerApproved(influencerId: number) {
    const notification = await this.createNotification({
      title: 'Account Approved',
      description: 'Your account has been approved',
      type: NotificationType.InfluencerApproved,
      variant: 'success',
      notificationPayload: { influencerId },
      notificationUsers: [influencerId],
    });

    return notification;
  }

  async influencerStatusUnchanged(influencerId: number, days: number) {
    const adminNotification = await this.createNotification({
      title: 'Influencer Status Unchanged',
      description: `Influencer status hasn't been changed for ${days} days`,
      type: NotificationType.InfluencerStatusUnchanged,
      variant: 'warning',
      notificationPayload: { influencerId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    const influencerNotification = await this.createNotification({
      title: 'Status Unchanged',
      description: `Your status hasn't been changed for ${days} days`,
      type: NotificationType.InfluencerStatusUnchanged,
      variant: 'warning',
      notificationPayload: { influencerId },
      notificationUsers: [influencerId],
    });

    return { adminNotification, influencerNotification };
  }

  async influencerEmailUnverified(influencerId: number, days: number) {
    const notification = await this.createNotification({
      title: 'Influencer Email Unverified',
      description: `Influencer hasn't verified their email for ${days} days`,
      type: NotificationType.InfluencerEmailUnverified,
      variant: 'warning',
      notificationPayload: { influencerId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async campaignCreated(userId: number, campaignId: number) {
    const notification = await this.createNotification({
      title: 'New Campaign',
      description: 'New campaign has been created',
      type: NotificationType.CampaignCreated,
      variant: 'info',
      notificationPayload: { userId, campaignId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async campaignInfluencerAdded(
    influencerId: number,
    clientId: number,
    campaignId: number,
  ) {
    const notification = await this.createNotification({
      title: 'Campaign',
      description: 'New influencer has been added to the campaign',
      type: NotificationType.CampaignInfluencerAdded,
      variant: 'info',
      notificationPayload: { influencerId, campaignId },
      notificationUsers: [clientId],
    });

    return notification;
  }

  async campaignInfluencerRemovedBeforeApplication(
    influencerId: number,
    campaignId: number,
  ) {
    const notification = await this.createNotification({
      title: 'Campaign',
      description: 'Influencer has been removed before their application',
      type: NotificationType.CampaignInfluencerRemovedBeforeApplication,
      variant: 'warning',
      notificationPayload: { influencerId, campaignId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async campaignInfluencerRemovedAfterApplication(
    influencerId: number,
    campaignId: number,
  ) {
    const adminNotification = await this.createNotification({
      title: 'Campaign',
      description: 'Influencer has been removed after their application',
      type: NotificationType.CampaignInfluencerRemovedAfterApplication,
      variant: 'error',
      notificationPayload: { influencerId, campaignId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    const influencerNotification = await this.createNotification({
      title: 'Campaign',
      description: 'You have been removed from the campaign',
      type: NotificationType.CampaignInfluencerRemovedAfterApplication,
      variant: 'error',
      notificationPayload: { influencerId, campaignId },
      notificationUsers: [influencerId],
    });

    return { adminNotification, influencerNotification };
  }

  async campaignInfluencerInvitedByClient(
    influencerId: number,
    clientId: number,
    campaignId: number,
  ) {
    const adminNotification = await this.createNotification({
      title: 'Campaign',
      description: 'Client have invited influencer to the campaign',
      type: NotificationType.CampaignInfluencerInvited,
      variant: 'info',
      notificationPayload: { influencerId, clientId, campaignId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    const influencerNotification = await this.createNotification({
      title: 'Campaign',
      description: 'Client have invited you to the campaign',
      type: NotificationType.CampaignInfluencerInvited,
      variant: 'info',
      notificationPayload: { clientId, campaignId },
      notificationUsers: [influencerId],
    });

    return { adminNotification, influencerNotification };
  }

  async campaignInfluencerInvitedByAdmin(
    influencerId: number,
    adminId: number,
    clientId: number,
    campaignId: number,
  ) {
    const clientNotification = await this.createNotification({
      title: 'Campaign',
      description: 'Admin have invited influencer to the campaign',
      type: NotificationType.CampaignInfluencerInvited,
      variant: 'info',
      notificationPayload: { influencerId, adminId, campaignId },
      notificationUsers: [clientId],
    });

    const influencerNotification = await this.createNotification({
      title: 'Campaign',
      description: 'Admin have invited you to the campaign',
      type: NotificationType.CampaignInfluencerInvited,
      variant: 'info',
      notificationPayload: { adminId, campaignId },
      notificationUsers: [influencerId],
    });

    return { clientNotification, influencerNotification };
  }

  async campaignInfluencerInviteAccepted(
    influencerId: number,
    clientId: number,
    campaignId: number,
  ) {
    const adminIndexes = await this.getAllAdminIndexes();

    const notification = await this.createNotification({
      title: 'Campaign',
      description: 'Influencer accepted campaign invite',
      type: NotificationType.CampaignInfluencerInviteAccepted,
      variant: 'success',
      notificationPayload: { influencerId, campaignId },
      notificationUsers: [...adminIndexes, clientId],
    });

    return notification;
  }

  async campaignInfluencerInviteDeclined(
    influencerId: number,
    clientId: number,
    campaignId: number,
  ) {
    const adminIndexes = await this.getAllAdminIndexes();

    const notification = await this.createNotification({
      title: 'Campaign',
      description: 'Influencer declined campaign invite',
      type: NotificationType.CampaignInfluencerInviteDeclined,
      variant: 'error',
      notificationPayload: { influencerId, campaignId },
      notificationUsers: [...adminIndexes, clientId],
    });

    return notification;
  }

  async campaignInfluencerWithdrawAfterApplication(
    influencerId: number,
    clientId: number,
    campaignId: number,
  ) {
    const adminIndexes = await this.getAllAdminIndexes();

    const notification = await this.createNotification({
      title: 'Campaign',
      description: 'Influencer withdrawed from campaign after application',
      type: NotificationType.CampaignInfluencerWithdrawAfterApplication,
      variant: 'info',
      notificationPayload: { influencerId, campaignId },
      notificationUsers: [...adminIndexes, clientId],
    });

    return notification;
  }

  async campaignInfluencerLinkSubmitted(
    influencerId: number,
    clientId: number,
    campaignId: number,
  ) {
    const adminIndexes = await this.getAllAdminIndexes();

    const notification = await this.createNotification({
      title: 'Campaign',
      description: 'Influencer submitted their link',
      type: NotificationType.CampaignInfluencerLinkSubmitted,
      variant: 'info',
      notificationPayload: { influencerId, campaignId },
      notificationUsers: [...adminIndexes, clientId],
    });

    return notification;
  }

  async campaignInfluencerMention(
    influencerId: number,
    adminId: number,
    campaignId: number,
  ) {
    const notification = await this.createNotification({
      title: 'Campaign',
      description: 'Influencer has mentioned you in chat',
      type: NotificationType.CampaignInfluencerMention,
      variant: 'info',
      notificationPayload: { influencerId, campaignId },
      notificationUsers: [adminId],
    });

    return notification;
  }

  async campaignMessageUnreadByInfluencer(
    influencerId: number,
    clientId: number,
    campaignId: number,
    minutes: number,
  ) {
    const notification = await this.createNotification({
      title: 'Campaign',
      description: `Influencer sent a message before ${minutes} minutes`,
      type: NotificationType.CampaignMessageUnread,
      variant: 'info',
      notificationPayload: { influencerId, campaignId },
      notificationUsers: [clientId],
    });

    return notification;
  }

  async campaignMessageUnreadByClient(
    influencerId: number,
    clientId: number,
    campaignId: number,
    minutes: number,
  ) {
    const notification = await this.createNotification({
      title: 'Campaign',
      description: `Client sent a message before ${minutes} minutes`,
      type: NotificationType.CampaignMessageUnread,
      variant: 'info',
      notificationPayload: { clientId, campaignId },
      notificationUsers: [influencerId],
    });

    return notification;
  }

  async campaignStarted(
    influencerIds: number[],
    clientId: number,
    ambassadorId: number,
    campaignId: number,
  ) {
    const notification = await this.createNotification({
      title: 'Campaign',
      description: `Campaign just started`,
      type: NotificationType.CampaignStarted,
      variant: 'info',
      notificationPayload: { campaignId },
      notificationUsers: [...influencerIds, clientId, ambassadorId],
    });

    return notification;
  }

  async campaignEnded(
    influencerIds: number[],
    clientId: number,
    ambassadorId: number,
    campaignId: number,
  ) {
    const notification = await this.createNotification({
      title: 'Campaign',
      description: `Campaign just ended`,
      type: NotificationType.CampaignEnded,
      variant: 'info',
      notificationPayload: { campaignId },
      notificationUsers: [...influencerIds, clientId, ambassadorId],
    });

    return notification;
  }

  async campaignReportOrdered(campaignId: number) {
    const notification = await this.createNotification({
      title: 'Campaign Report',
      description: `New report ordered for campaign`,
      type: NotificationType.CampaignReportOrdered,
      variant: 'info',
      notificationPayload: { campaignId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async campaignReportDelivered(
    clientId: number,
    ambassadorId: number,
    campaignId: number,
    campaignReportId: number,
  ) {
    const notification = await this.createNotification({
      title: 'Campaign Report',
      description: `Report delivered for campaign`,
      type: NotificationType.CampaignReportDelivered,
      variant: 'info',
      notificationPayload: { campaignId, campaignReportId },
      notificationUsers: [clientId, ambassadorId],
    });

    return notification;
  }

  async smlOrdered(socialMediaListeningId: number) {
    const notification = await this.createNotification({
      title: 'SML',
      description: `New order for SML`,
      type: NotificationType.SmlOrdered,
      variant: 'info',
      notificationPayload: { socialMediaListeningId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async smlDelivered(
    clientId: number,
    socialMediaListeningId: number,
    ambassadorId?: number,
  ) {
    const notification = await this.createNotification({
      title: 'SML',
      description: `SML has been delivered`,
      type: NotificationType.SmlDelivered,
      variant: 'info',
      notificationPayload: { socialMediaListeningId },
      notificationUsers: [clientId, ambassadorId].filter((user) => !!user),
    });

    return notification;
  }

  async smlTokensRequested(socialMediaListeningId: number) {
    const notification = await this.createNotification({
      title: 'SML',
      description: `SML tokens are requested`,
      type: NotificationType.SmlTokensRequested,
      variant: 'info',
      notificationPayload: { socialMediaListeningId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async surveyCreated(surveyId: number) {
    const notification = await this.createNotification({
      title: 'Survey',
      description: `New survey has been created`,
      type: NotificationType.SurveyCreated,
      variant: 'info',
      notificationPayload: { surveyId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async surveyInfluencerInvited(influencerId: number, surveyId: number) {
    const notification = await this.createNotification({
      title: 'Survey',
      description: `You have been invited to the survey`,
      type: NotificationType.SurveyInfluencerInvited,
      variant: 'info',
      notificationPayload: { influencerId, surveyId },
      notificationUsers: [influencerId],
    });

    return notification;
  }

  async surveyInfluencerInviteAccepted(influencerId: number, surveyId: number) {
    const notification = await this.createNotification({
      title: 'Survey',
      description: `Influencer has accepted invitation to the survey`,
      type: NotificationType.SurveyInfluencerInviteAccepted,
      variant: 'success',
      notificationPayload: { influencerId, surveyId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async surveyInfluencerInviteDeclined(influencerId: number, surveyId: number) {
    const notification = await this.createNotification({
      title: 'Survey',
      description: `Influencer has declined invitation to the survey`,
      type: NotificationType.SurveyInfluencerInviteDeclined,
      variant: 'error',
      notificationPayload: { influencerId, surveyId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async surveyInfluencerRemovedAfterApplication(
    influencerId: number,
    surveyId: number,
  ) {
    const notification = await this.createNotification({
      title: 'Survey',
      description: `You have been removed from survey after application`,
      type: NotificationType.SurveyInfluencerRemovedAfterApplication,
      variant: 'warning',
      notificationPayload: { influencerId, surveyId },
      notificationUsers: [influencerId],
    });

    return notification;
  }

  async surveyInfluencerAnswersSubmited(
    clientId: number,
    influencerId: number,
    surveyId: number,
  ) {
    const adminIndexes = await this.getAllAdminIndexes();

    const notification = await this.createNotification({
      title: 'Survey',
      description: `Influencer has submitted survey answers`,
      type: NotificationType.SurveyInfluencerAnswersSubmited,
      variant: 'info',
      notificationPayload: { influencerId, surveyId },
      notificationUsers: [...adminIndexes, clientId],
    });

    return notification;
  }

  async surveyAnswersApproved(influencerId: number, surveyId: number) {
    const notification = await this.createNotification({
      title: 'Survey',
      description: `Your survey answers have been approved`,
      type: NotificationType.SurveyAnswersApproved,
      variant: 'info',
      notificationPayload: { influencerId, surveyId },
      notificationUsers: [influencerId],
    });

    return notification;
  }

  async surveyMessageUnreadByInfluencer(
    influencerId: number,
    adminId: number,
    surveyId: number,
    minutes: number,
  ) {
    const notification = await this.createNotification({
      title: 'Survey',
      description: `Influencer sent a message before ${minutes} minutes`,
      type: NotificationType.SurveyMessageUnread,
      variant: 'info',
      notificationPayload: { influencerId, surveyId },
      notificationUsers: [adminId],
    });

    return notification;
  }

  async surveyMessageUnreadByAdmin(
    influencerId: number,
    adminId: number,
    surveyId: number,
    minutes: number,
  ) {
    const notification = await this.createNotification({
      title: 'Survey',
      description: `Admin sent a message before ${minutes} minutes`,
      type: NotificationType.SurveyMessageUnread,
      variant: 'info',
      notificationPayload: { adminId, surveyId },
      notificationUsers: [influencerId],
    });

    return notification;
  }

  async SurveyStarted(
    influencerIds: number[],
    clientId: number,
    ambassadorId: number,
    surveyId: number,
  ) {
    const notification = await this.createNotification({
      title: 'Survey',
      description: `Survey just started`,
      type: NotificationType.SurveyStarted,
      variant: 'info',
      notificationPayload: { surveyId },
      notificationUsers: [...influencerIds, clientId, ambassadorId],
    });

    return notification;
  }

  async SurveyEnded(
    influencerIds: number[],
    clientId: number,
    ambassadorId: number,
    surveyId: number,
  ) {
    const notification = await this.createNotification({
      title: 'Survey',
      description: `Survey just ended`,
      type: NotificationType.SurveyEnded,
      variant: 'info',
      notificationPayload: { surveyId },
      notificationUsers: [...influencerIds, clientId, ambassadorId],
    });

    return notification;
  }

  async paymentRequested(
    userId: number,
    transactionId: number,
    transactionFlowId: number,
  ) {
    const notification = await this.createNotification({
      title: 'Finance',
      description: `New payment request`,
      type: NotificationType.PaymentRequested,
      variant: 'info',
      notificationPayload: { userId, transactionId, transactionFlowId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async paymentApproved(
    userId: number,
    transactionId: number,
    transactionFlowId: number,
  ) {
    const notification = await this.createNotification({
      title: 'Finance',
      description: `Your payment has been approved`,
      type: NotificationType.PaymentApproved,
      variant: 'success',
      notificationPayload: { userId, transactionId, transactionFlowId },
      notificationUsers: [userId],
    });

    return notification;
  }

  async paymentDeclined(
    userId: number,
    transactionId: number,
    transactionFlowId: number,
  ) {
    const notification = await this.createNotification({
      title: 'Finance',
      description: `Your payment has been declined`,
      type: NotificationType.PaymentDeclined,
      variant: 'error',
      notificationPayload: { userId, transactionId, transactionFlowId },
      notificationUsers: [userId],
    });

    return notification;
  }

  async withdrawRequested(userId: number, transactionId: number) {
    const notification = await this.createNotification({
      title: 'Finance',
      description: `New withdraw request`,
      type: NotificationType.WithdrawRequested,
      variant: 'info',
      notificationPayload: { transactionId, userId },
      notificationUsers: await this.getAllAdminIndexes(),
    });

    return notification;
  }

  async withdrawApproved(userId: number, transactionId: number) {
    const notification = await this.createNotification({
      title: 'Finance',
      description: `Your withdraw has been approved`,
      type: NotificationType.WithdrawApproved,
      variant: 'success',
      notificationPayload: { userId, transactionId },
      notificationUsers: [userId],
    });

    return notification;
  }

  async withdrawDeclined(userId: number, transactionId: number) {
    const notification = await this.createNotification({
      title: 'Finance',
      description: `Your withdraw has been declined`,
      type: NotificationType.WithdrawDeclined,
      variant: 'error',
      notificationPayload: { userId, transactionId },
      notificationUsers: [userId],
    });

    return notification;
  }
}
