import type { Env } from '../../../types';
import type { EmailProvider, EmailSendResult, OutgoingEmail } from '../provider';

/** Messages the mock provider "sent" in this isolate, for tests and local stacks. Nothing leaves the process. */
export const mockSent: OutgoingEmail[] = [];

/** Mock: records the message and answers success with a fake id. Selected with EMAIL_SYSTEM_PROVIDER=mock. */
export const mockProvider: EmailProvider = {
  name: 'mock',
  async send(_env: Env, message: OutgoingEmail): Promise<EmailSendResult> {
    mockSent.push(message);
    if (mockSent.length > 200) mockSent.shift();
    return { success: true, provider: 'mock', messageId: `mock-${mockSent.length}` };
  },
};
