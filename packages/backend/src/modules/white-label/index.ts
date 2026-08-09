import crypto from "crypto";
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import type { TenantDomainRow } from "../types.js";
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

export async function registerWhiteLabelModule(app: FastifyInstance) {
  // ── Tenant Branding ──
  app.get('/api/v1/white-label/branding', { preHandler: [authenticate, authorize('white_label.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    let brand = await db('tenant_branding').where({ tenant_id: tenantId }).first();
    if (!brand) {
      // Return defaults
      return sendSuccess(reply, {
        brandName: null, logoUrl: null, faviconUrl: null,
        primaryColor: '#0D9488', secondaryColor: '#14B8A6', accentColor: '#F59E0B',
        fontFamily: 'Inter', customCss: null, customJs: null,
        emailTemplates: {}, loginPage: {}
      });
    }
    return sendSuccess(reply, {
      id: brand.id, brandName: brand.brand_name, logoUrl: brand.logo_url,
      faviconUrl: brand.favicon_url, primaryColor: brand.primary_color,
      secondaryColor: brand.secondary_color, accentColor: brand.accent_color,
      fontFamily: brand.font_family, customCss: brand.custom_css,
      customJs: brand.custom_js, emailTemplates: brand.email_templates,
      loginPage: brand.login_page
    });
  });

  app.put('/api/v1/white-label/branding', { preHandler: [authenticate, authorize('white_label.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.brandName !== undefined) update.brand_name = body.brandName;
    if (body.logoUrl !== undefined) update.logo_url = body.logoUrl;
    if (body.faviconUrl !== undefined) update.favicon_url = body.faviconUrl;
    if (body.primaryColor) update.primary_color = body.primaryColor;
    if (body.secondaryColor) update.secondary_color = body.secondaryColor;
    if (body.accentColor) update.accent_color = body.accentColor;
    if (body.fontFamily) update.font_family = body.fontFamily;
    if (body.customCss !== undefined) update.custom_css = body.customCss;
    if (body.customJs !== undefined) update.custom_js = body.customJs;
    if (body.emailTemplates) update.email_templates = JSON.stringify(body.emailTemplates);
    if (body.loginPage) update.login_page = JSON.stringify(body.loginPage);

    const existing = await db('tenant_branding').where({ tenant_id: tenantId }).first();
    if (existing) {
      await db('tenant_branding').where({ tenant_id: tenantId }).update(update);
    } else {
      await db('tenant_branding').insert({ tenant_id: tenantId, ...update });
    }
    return sendSuccess(reply, null, 'Branding updated');
  });

  // ── Custom Domains ──
  app.get('/api/v1/white-label/domains', { preHandler: [authenticate, authorize('white_label.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const domains = await db('tenant_domains').where({ tenant_id: tenantId }).orderBy('is_primary', 'desc');
    return sendSuccess(reply, domains.map((d: Record<string, unknown>) => ({
      id: d.id, domain: d.domain, isPrimary: d.is_primary,
      isVerified: d.is_verified, sslStatus: d.ssl_status,
      verifiedAt: d.verified_at, createdAt: d.created_at
    })));
  });

  app.post('/api/v1/white-label/domains', { preHandler: [authenticate, authorize('white_label.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    const token = crypto.randomBytes(24).toString("base64url");
    const [d] = await db('tenant_domains').insert({
      tenant_id: tenantId, domain: body.domain, is_primary: body.isPrimary || false,
      verification_token: token
    }).returning('*');
    return sendSuccess(reply, { id: d.id, domain: d.domain, verificationToken: d.verification_token }, 'Domain added. Verify by adding the TXT record.', 201);
  });

  app.post('/api/v1/white-label/domains/:id/verify', { preHandler: [authenticate, authorize('white_label.manage')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db('tenant_domains').where({ id }).update({ is_verified: true, verified_at: new Date(), ssl_status: 'active', updated_at: new Date() });
    return sendSuccess(reply, null, 'Domain verified');
  });

  app.delete('/api/v1/white-label/domains/:id', { preHandler: [authenticate, authorize('white_label.manage')] }, async (request, reply) => {
    await db('tenant_domains').where({ id: (request.params as { id: string }).id }).del();
    return sendSuccess(reply, null, 'Domain removed');
  });

  // ── Tenant Settings (branding-aware) ──
  app.get('/api/v1/white-label/settings', { preHandler: [authenticate, authorize('white_label.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const tenant = await db('tenants').where({ id: tenantId }).select('name', 'slug', 'domain', 'locale', 'timezone', 'settings').first();
    const brand = await db('tenant_branding').where({ tenant_id: tenantId }).first();
    return sendSuccess(reply, {
      name: tenant.name, slug: tenant.slug, domain: tenant.domain,
      locale: tenant.locale, timezone: tenant.timezone,
      settings: tenant.settings,
      branding: brand ? { brandName: brand.brand_name, logoUrl: brand.logo_url, primaryColor: brand.primary_color, fontFamily: brand.font_family } : null
    });
  });
}
