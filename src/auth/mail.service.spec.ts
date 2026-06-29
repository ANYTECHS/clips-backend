import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('MailService', () => {
  it('renders template and sends email through SMTP transport', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail,
    } as any);

    const service = new MailService();
    await service.sendTemplatedEmail({
      to: 'user@example.com',
      subject: 'Reset your password',
      template: 'password-reset',
      context: { token: 'xyz' },
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Reset your password',
        text: expect.stringContaining('token=xyz'),
      }),
    );
  });
});
