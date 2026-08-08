import './loadEnv.js';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';

import websocket from '@fastify/websocket';
import jwt from '@fastify/jwt';
import { getEnv, validateProductionEnvironment, validateDevelopmentEnvironment } from '@healthcare/shared/config';
import { registerAuthModule } from './modules/auth/index.js';
import { registerPatientModule } from './modules/patient/index.js';
import { registerAppointmentModule } from './modules/appointment/index.js';
import { registerEmrModule } from './modules/emr/index.js';
import { registerBillingModule } from './modules/billing/index.js';
import { registerCommonModule } from './modules/common/index.js';
import { errorHandler } from './core/error-handler.js';
import { db } from './core/database.js';
import { redis } from './core/redis.js';

import { registerLaboratoryModule } from './modules/laboratory/index.js';
import { registerRadiologyModule } from './modules/radiology/index.js';
import { registerPharmacyModule } from './modules/pharmacy/index.js';
import { registerQueueModule } from './modules/queue/index.js';
import { registerReferralModule } from './modules/referral/index.js';
import { registerNotificationModule } from './modules/notification/index.js';
import { registerNursingModule } from './modules/nursing/index.js';
import { registerHomeVisitsModule } from './modules/home-visits/index.js';
import { registerTelemedicineModule } from './modules/telemedicine/index.js';
import { registerInsuranceModule } from './modules/insurance/index.js';
import { registerInventoryModule } from './modules/inventory/index.js';
import { registerHrModule } from './modules/hr/index.js';
import { registerCrmModule } from './modules/crm/index.js';
import { registerDmsModule } from './modules/dms/index.js';
import { registerWorkflowModule } from './modules/workflow/index.js';
import { registerFormsModule } from './modules/forms/index.js';
import { registerComplianceModule } from './modules/compliance/index.js';
import { registerAiHubModule } from './modules/ai-hub/index.js';
import { registerBiModule } from './modules/bi/index.js';
import { registerReportsModule } from './modules/reports/index.js';
import { registerIntegrationsModule } from './modules/integrations/index.js';
import { registerSaasBillingModule } from './modules/saas-billing/index.js';
import { registerWhiteLabelModule } from './modules/white-label/index.js';
import { registerComplianceReportsModule } from './modules/compliance-reports/index.js';
import { registerDrBackupModule } from './modules/dr-backup/index.js';
import { registerRegionsModule } from './modules/regions/index.js';
import { registerPatientPortalModule } from './modules/patient-portal/index.js';
import { registerOnlineBookingModule } from './modules/online-booking/index.js';
import { registerPatientMessagingModule } from './modules/patient-messaging/index.js';
import { registerApiGatewayModule } from './modules/api-gateway/index.js';
import { registerDataExportModule } from './modules/data-export/index.js';
import { registerSystemMonitorModule } from './modules/system-monitor/index.js';
import { registerBulkImportModule } from './modules/bulk-import/index.js';
import { registerUserPreferencesModule } from './modules/user-preferences/index.js';
import { registerPrintTemplatesModule } from './modules/print-templates/index.js';
import { registerCommunicationsModule } from './modules/communications/index.js';
import { registerAuditModule } from "./modules/audit/index.js";
import { registerSessionManagerModule } from './modules/session-manager/index.js';
import { registerAutomationModule } from './modules/automation/index.js';
import { registerBarcodesModule } from './modules/barcodes/index.js';
import { registerDataWarehouseModule } from './modules/data-warehouse/index.js';
import { registerInsuranceClaimsModule } from './modules/insurance-claims/index.js';
import { registerClinicalModule } from './modules/clinical/index.js';
import { registerAdvancedCommunicationModule } from './modules/advanced-communication/index.js';
import { registerFinancialDeepeningModule } from './modules/financial-deepening/index.js';
import { registerAiIntelligenceModule } from './modules/ai-intelligence/index.js';
import { registerHealthModule } from './modules/health/index.js';
import { initSentry } from './services/sentry.js';
import { registerPatientExperienceModule } from './modules/patient-experience/index.js';
import { registerPdfModule } from './modules/pdf-generator/index.js';
import { registerDashboardWidgetsModule } from './modules/dashboard-widgets/index.js';
import { registerPatientSchedulingModule } from './modules/patient-scheduling/index.js';
import { registerRbacModule } from './modules/rbac/index.js';
import { registerMedicalContentModule } from './modules/medical-content/index.js';
import { registerMultiBranchModule } from './modules/multi-branch/index.js';
import { startReminderService } from './services/reminder.service.js';
import { loggerOptions } from "./utils/logger.js";
import pino from "pino";
import pinoHttp from "pino-http";
import { apiVersioningHook } from "./core/versioning/index.js";
import { csrfValidation } from "./modules/auth/index.js";

const env = getEnv();
initSentry();

async function buildApp() {
  const app = Fastify({
    logger: loggerOptions,
  });

  // Plugins
  await app.register(cookie, { secret: env.CSRF_SECRET || 'csrf-secret', hook: 'onRequest' });
  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  // Pino HTTP middleware for structured request logging with redaction
  const httpLogger = pinoHttp({ logger: pino(loggerOptions), redact: ["req.headers.authorization", "req.body.token", "req.body.password", "req.body.refreshToken"] });
  app.addHook("onRequest", (request, reply, done) => { httpLogger(request.raw, reply.raw); done(); });
  app.addHook("onRequest", apiVersioningHook);
  app.addHook("onRequest", csrfValidation);
  await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  await app.register(websocket);
  await app.register(jwt, { secret: env.JWT_SECRET });

  // Decorate app with authenticate middleware
  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ success: false, error: "Unauthorized" });
      return;
    }
    const req = request as any;
    const { tenantId, userId, roles, permissions, locale, branchId } = request.user as any;
    req.tenantId = tenantId;
    req.ctx = {
      tenantId,
      userId,
      roles: roles || [],
      permissions: permissions || [],
      locale: locale || 'en',
      branchId,
      requestId: request.id,
    };
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Vision Healthcare ERP API',
        description: 'Enterprise Healthcare ERP SaaS Platform API',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Error handler
  app.setErrorHandler(errorHandler);

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  // Register modules
  await registerCommonModule(app);
  await registerAuthModule(app);
  await registerPatientModule(app);
  await registerAppointmentModule(app);
  await registerEmrModule(app);
  await registerBillingModule(app);
  await registerLaboratoryModule(app);
  await registerRadiologyModule(app);
  await registerPharmacyModule(app);
  await registerQueueModule(app);
  await registerReferralModule(app);
  await registerNotificationModule(app);
  await registerNursingModule(app);
  await registerHomeVisitsModule(app);
  await registerTelemedicineModule(app);



  await registerInsuranceModule(app);
  await registerInventoryModule(app);
  await registerHrModule(app);
  await registerCrmModule(app);
  await registerDmsModule(app);
  await registerWorkflowModule(app);
  await registerFormsModule(app);
  await registerComplianceModule(app);
  await registerAiHubModule(app);
  await registerBiModule(app);
  await registerReportsModule(app);
  await registerIntegrationsModule(app);
  await registerSaasBillingModule(app);
  await registerWhiteLabelModule(app);
  await registerComplianceReportsModule(app);
  await registerDrBackupModule(app);
  await registerRegionsModule(app);
  await registerPatientPortalModule(app);
  await registerOnlineBookingModule(app);
  await registerPatientMessagingModule(app);
  await registerApiGatewayModule(app);
  await registerDataExportModule(app);
  await registerSystemMonitorModule(app);
  await registerBulkImportModule(app);
  await registerUserPreferencesModule(app);
  await registerPrintTemplatesModule(app);
  await registerCommunicationsModule(app);
  await registerAuditModule(app);
  await registerSessionManagerModule(app);
  await registerAutomationModule(app);
  await registerBarcodesModule(app);
  await registerDataWarehouseModule(app);
  await registerInsuranceClaimsModule(app);
  await registerClinicalModule(app);
await registerAdvancedCommunicationModule(app);
await registerFinancialDeepeningModule(app);
await registerHealthModule(app);
await registerAiIntelligenceModule(app);
await registerPatientExperienceModule(app);
  await registerPdfModule(app);
await registerDashboardWidgetsModule(app);
  await registerPatientSchedulingModule(app);
  await registerRbacModule(app);
  await registerMedicalContentModule(app);
  await registerMultiBranchModule(app);
  return app;
}

async function start() {
  validateProductionEnvironment();
  try {
    await db.raw('SELECT 1');
    console.log('✓ Database connected');
  } catch (err) {
    console.error('✗ Database connection failed:', err);
    process.exit(1);
  }

  // Run migrations automatically on startup
  try {
    const migrationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
    const [batchNo, migrations] = await db.migrate.latest({
      directory: migrationDir,
    });
    if (migrations.length === 0) {
      console.log('✓ Database is up to date');
    } else {
      console.log(`✓ Ran ${migrations.length} migration(s) (batch ${batchNo})`);
    }
  } catch (err) {
    console.error('✗ Migration failed:', err);
    console.error('Server will continue, but some tables may be missing.');
  }

  try {
    await redis.ping();
    console.log('✓ Redis connected');
  } catch (err) {
    console.error('✗ Redis connection failed:', err);
  }

  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    console.log(`✓ Server running on http://${env.HOST}:${env.PORT}`);
    console.log(`✓ API Docs at http://localhost:${env.PORT}/docs`);
    
    startReminderService();

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log('\n✓ ' + signal + ' received. Shutting down gracefully...');
      try {
        await app.close();
        console.log('✓ Fastify server closed');
        await db.destroy();
        console.log('✓ Database pool destroyed');
        await redis.quit();
        console.log('✓ Redis disconnected');
        process.exit(0);
      } catch (err) {
        console.error('✗ Error during shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
