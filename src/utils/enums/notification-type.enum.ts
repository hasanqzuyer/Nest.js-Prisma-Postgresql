export enum NotificationType {
  //Client
  ClientICRegistered = 1,
  ClientRegistered = 2,
  ClientStatusUnchanged = 3,
  ClientOrderCreated = 4,
  ClientEmailUnverified = 5,

  // Influencer
  InfluencerRegistered = 101,
  InfluencerVerified = 102,
  InfluencerApproved = 103,
  InfluencerStatusUnchanged = 104,
  InfluencerEmailUnverified = 105,

  // Campaigns
  CampaignCreated = 201,
  CampaignInfluencerAdded = 202,
  CampaignInfluencerRemovedBeforeApplication = 203,
  CampaignInfluencerRemovedAfterApplication = 204,
  CampaignInfluencerInvited = 205,
  CampaignInfluencerInviteAccepted = 206,
  CampaignInfluencerInviteDeclined = 207,
  CampaignInfluencerWithdrawAfterApplication = 208,
  CampaignInfluencerLinkSubmitted = 209,
  CampaignInfluencerMention = 210,
  CampaignMessageUnread = 211,
  CampaignStarted = 212,
  CampaignEnded = 213,

  // Campaign Reports
  CampaignReportOrdered = 301,
  CampaignReportDelivered = 302,

  // SML
  SmlOrdered = 401,
  SmlDelivered = 402,
  SmlTokensRequested = 403,

  // Surveys
  SurveyCreated = 501,
  SurveyInfluencerInvited = 502,
  SurveyInfluencerInviteAccepted = 503,
  SurveyInfluencerInviteDeclined = 504,
  SurveyInfluencerRemovedAfterApplication = 505,
  SurveyInfluencerAnswersSubmited = 506,
  SurveyAnswersApproved = 507,
  SurveyMessageUnread = 508,
  SurveyStarted = 509,
  SurveyEnded = 510,

  // Payments
  PaymentRequested = 601,
  PaymentApproved = 602,
  PaymentDeclined = 603,
  WithdrawRequested = 604,
  WithdrawApproved = 605,
  WithdrawDeclined = 606,
}
