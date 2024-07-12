import { Inject, Injectable, Logger } from '@nestjs/common';
import { SendgridService } from './sendgrid.service';
import { Mail } from './types/mail.type';
import { IUserJwtPayload } from 'src/core/auth/interfaces/jwt-payload.interface';
import { JwtService } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import sendgridConfig from '../../config/sendgrid.config';
import { Locale, UserRole } from 'src/utils';
import { generateLocaleUrl } from 'src/utils/generators/locale-url.generator';
import securityConfig from 'src/config/security.config';
import { SendgridSender } from './enums/sender.enum';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly sendgridService: SendgridService,
    private readonly jwtService: JwtService,
    @Inject(sendgridConfig.KEY)
    private readonly _sendgridConfig: ConfigType<typeof sendgridConfig>,
    @Inject(securityConfig.KEY)
    private readonly _securityConfig: ConfigType<typeof securityConfig>,
  ) {}

  async sendConfirmationEmail(
    id: number,
    email: string,
    role: number,
    firstName: string,
    locale: Locale | string = Locale.en,
  ) {
    const payload: IUserJwtPayload = { id, email, role };
    const token = await this.jwtService.signAsync(payload, { expiresIn: '1h' });
    const baseUrl = `${this._securityConfig.protocol}://${[
      this._securityConfig.appSubdomain,
      this._securityConfig.baseDomain,
    ]
      .filter((s) => !!s)
      .join('.')}`;
    const returnUrl = generateLocaleUrl(
      baseUrl,
      this._sendgridConfig.returnUrls.emailConfirmation,
      locale,
    );
    const confirmationLink = `${returnUrl}?token=${token}`;

    const data = {
      email,
      firstName,
      confirmationLink,
    };

    if (role === UserRole.Influencer) {
      if (locale.includes('en')) {
        await this.sendgridService.send(
          SendgridSender.Welcome,
          email,
          Mail.ConfirmEmailInfluencerEN,
          data,
        );
      } else if (locale.includes('de')) {
        await this.sendgridService.send(
          SendgridSender.Welcome,
          email,
          Mail.ConfirmEmailInfluencerDE,
          data,
        );
      }
    } else if ([UserRole.Client, UserRole.Ambassador].includes(role)) {
      if (locale.includes('en')) {
        await this.sendgridService.send(
          SendgridSender.Welcome,
          email,
          Mail.ConfirmEmailClientEN,
          data,
        );
      } else if (locale.includes('de')) {
        await this.sendgridService.send(
          SendgridSender.Welcome,
          email,
          Mail.ConfirmEmailClientDE,
          data,
        );
      }
    } else {
      throw 'Send confirmation email error! Bad role!';
    }
    this.logger.verbose(`Account confirmation email has been sent to ${email}`);
  }

  async sendAccountActivated(
    email: string,
    role: number,
    firstName: string,
    affiliateLink?: string | null,
    locale: Locale | string = Locale.en,
  ) {
    const data = {
      email,
      firstName,
      affiliateLink,
    };

    if (role === UserRole.Ambassador) {
      if (locale.includes('en')) {
        await this.sendgridService.send(
          SendgridSender.Welcome,
          email,
          Mail.AccountActivatedAmbassadorEN,
          data,
        );
      }
    } else if (role === UserRole.Client) {
      if (locale.includes('en')) {
        await this.sendgridService.send(
          SendgridSender.Welcome,
          email,
          Mail.AccountActivatedClientEN,
          data,
        );
      } else if (locale.includes('de')) {
        await this.sendgridService.send(
          SendgridSender.Welcome,
          email,
          Mail.AccountActivatedClientDE,
          data,
        );
      }
    } else if (role === UserRole.Influencer) {
      if (locale.includes('en')) {
        await this.sendgridService.send(
          SendgridSender.Welcome,
          email,
          Mail.AccountActivatedInfluencerEN,
          data,
        );
      } else if (locale.includes('de')) {
        await this.sendgridService.send(
          SendgridSender.Welcome,
          email,
          Mail.AccountActivatedInfluencerDE,
          data,
        );
      }
    } else {
      throw 'Send confirmation email error! Bad role!';
    }
    this.logger.verbose(`Account activated email has been sent to ${email}`);
  }

  async sendPasswordResetEN(
    email: string,
    firstName: string,
    passwordResetLink: string,
  ) {
    const data = {
      email,
      firstName,
      passwordResetLink,
    };
    try {
      await this.sendgridService.send(
        SendgridSender.Welcome,
        email,
        Mail.ResetPasswordEN,
        data,
      );
      this.logger.verbose(`Password reset link has been sent to ${email}`);
    } catch (error) {
      this.logger.verbose(error);
    }
  }

  async sendEmptyClient(email: string, firstName: string, content: string) {
    const data = {
      email,
      firstName,
      content,
    };
    await this.sendgridService.send(
      SendgridSender.Welcome,
      email,
      Mail.EmptyClient,
      data,
    );
    this.logger.verbose(`Email has been sent to a client: ${email}`);
  }

  async sendClientInvitation(
    email: string,
    firstName: string,
    invitationLink: string,
    content: string,
  ) {
    const data = {
      email,
      firstName,
      invitationLink,
      content,
    };
    await this.sendgridService.send(
      SendgridSender.Welcome,
      email,
      Mail.InviteClient,
      data,
    );
    this.logger.verbose(
      `Invitation email has been sent to a discover client: ${email}`,
    );
  }

  async sendEmptyInfluencer(email: string, firstName: string, content: string) {
    const data = {
      email,
      firstName,
      content,
    };
    await this.sendgridService.send(
      SendgridSender.Welcome,
      email,
      Mail.EmptyInfluencer,
      data,
    );
    this.logger.verbose(`Email has been sent to an influencer: ${email}`);
  }

  async contactAdmins(
    recipientEmail: SendgridSender,
    userEmail: string,
    subject: string,
    message: string,
  ) {
    await this.sendgridService.sendNoTemplate(
      recipientEmail,
      SendgridSender.Support,
      subject,
      `<div>
        <p>${message}</p>
        <p> <br><br> by ${userEmail}</p>
      </div>`,
    );

    this.logger.verbose(
      `Contact admins email has been sent to by ${userEmail}`,
    );
  }
}
