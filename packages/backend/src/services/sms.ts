import { getEnv } from '@healthcare/shared/config';
import { providerRuntimeOrFallback } from './clinic-provider-runtime.js';

interface SmsOptions {
  tenantId?: string;
  to: string;
  message: string;
}

export async function sendSms(options: SmsOptions): Promise<boolean> {
  const env = getEnv();
  const runtime = await providerRuntimeOrFallback(options.tenantId, 'twilio', {
    secrets: {
      account_sid: env.TWILIO_ACCOUNT_SID || '',
      auth_token: env.TWILIO_AUTH_TOKEN || '',
      phone_number: env.TWILIO_PHONE_NUMBER || '',
    },
  });
  const accountSid = runtime?.secrets.account_sid;
  const authToken = runtime?.secrets.auth_token;
  const fromNumber = runtime?.secrets.messaging_service_sid || runtime?.secrets.whatsapp_number || runtime?.secrets.voice_number || runtime?.secrets.phone_number || env.TWILIO_PHONE_NUMBER;

  if (runtime?.status === 'disabled') return false;
  if (runtime && runtime.status !== 'environment_fallback' && !(accountSid && authToken && fromNumber)) return false;
  if (accountSid && authToken && fromNumber) {
    try {
      const twilio = require('twilio');
      const client = twilio(accountSid, authToken);
      await client.messages.create({ body: options.message, from: fromNumber, to: options.to });
      return true;
    } catch (error: any) {
      console.error('✗ SMS send failed:', error.message);
      return false;
    }
  }

  console.log('[SMS DEV]', options);
  return true;
}
