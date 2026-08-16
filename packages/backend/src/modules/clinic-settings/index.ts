import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

export async function registerClinicSettingsModule(app: FastifyInstance) {

  // Get clinic settings (includes Twilio credentials for WhatsApp/Voice)
  app.get('/api/v1/clinic-settings', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const tenant = await db('tenants').where({ id: tenantId }).select('name', 'settings').first();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    return sendSuccess(reply, {
      // Clinic info
      clinicName: settings.clinicName || tenant?.name || '',
      branch: settings.branch || '',
      landPhone: settings.landPhone || '',
      whatsappPhone: settings.whatsappPhone || '',
      logoUrl: settings.logoUrl || '',
      address: settings.address || '',
      city: settings.city || '',
      country: settings.country || '',
      googleMapsLocation: settings.googleMapsLocation || '',
      email: settings.email || '',
      website: settings.website || '',
      workingHours: settings.workingHours || 'Sun-Thu: 9AM-5PM',
      licenseNumber: settings.licenseNumber || '',
      taxNumber: settings.taxNumber || '',
      // Twilio credentials (for real WhatsApp & Voice)
      twilioAccountSid: settings.twilioAccountSid || '',
      twilioAuthToken: settings.twilioAuthToken || '',
      twilioWhatsAppNumber: settings.twilioWhatsAppNumber || '',
      twilioVoiceNumber: settings.twilioVoiceNumber || '',
      twilioMessagingServiceSid: settings.twilioMessagingServiceSid || '',
    });
  });

  // Update clinic settings
  app.put('/api/v1/clinic-settings', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = request.body as Record<string, unknown>;
    const tenant = await db('tenants').where({ id: tenantId }).select('settings').first();
    const currentSettings = (tenant?.settings as Record<string, unknown>) || {};
    const updatedSettings = { ...currentSettings, ...body };
    await db('tenants').where({ id: tenantId }).update({ settings: JSON.stringify(updatedSettings), updated_at: new Date() });
    return sendSuccess(reply, null, 'Clinic settings updated');
  });
}
