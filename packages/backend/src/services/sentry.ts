import { getEnv } from '@healthcare/shared/config';

let sentryInitialized = false;

interface SentryEvent {
  message?: string;
  level?: 'error' | 'warning' | 'info' | 'debug';
  exception?: Error;
  extra?: Record<string, any>;
  tags?: Record<string, string>;
  user?: { id?: string; email?: string; tenantId?: string };
}

export function initSentry(): boolean {
  if (sentryInitialized) return true;
  const env = getEnv();
  if (!env.SENTRY_DSN) return false;

  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      release: `clinic-management-system@${env.APP_VERSION || '1.0.0'}`,
      tracesSampleRate: env.NODE_ENV === 'production' ? 0.3 : 0.0,
      maxBreadcrumbs: 50,
      attachStacktrace: true,
      initialScope: {
        tags: { service: 'backend', version: env.APP_VERSION || '1.0.0' },
      },
    });
    sentryInitialized = true;
    console.log('✓ Sentry initialized');
    return true;
  } catch (err: any) {
    console.warn('⚠ Sentry not available:', err.message);
    return false;
  }
}

export function captureError(event: SentryEvent): void {
  if (!sentryInitialized) return;

  try {
    const Sentry = require('@sentry/node');

    if (event.exception) {
      Sentry.captureException(event.exception, {
        level: event.level || 'error',
        tags: event.tags,
        extra: event.extra,
        user: event.user,
      });
    } else if (event.message) {
      Sentry.captureMessage(event.message, {
        level: event.level || 'error',
        tags: event.tags,
        extra: event.extra,
        user: event.user,
      });
    }
  } catch {
    // Sentry should never break the app
  }
}

export function setSentryUser(user: { id: string; email?: string; tenantId?: string }): void {
  if (!sentryInitialized) return;
  try {
    const Sentry = require('@sentry/node');
    Sentry.setUser({
      id: user.id,
      email: user.email,
      tenant_id: user.tenantId,
    });
  } catch { /* ignore */ }
}

export function addSentryBreadcrumb(message: string, category?: string, data?: any): void {
  if (!sentryInitialized) return;
  try {
    const Sentry = require('@sentry/node');
    Sentry.addBreadcrumb({
      message,
      category: category || 'app',
      data,
      timestamp: Date.now(),
    });
  } catch { /* ignore */ }
}

export function closeSentry(): Promise<boolean> {
  if (!sentryInitialized) return Promise.resolve(true);
  try {
    const Sentry = require('@sentry/node');
    return Sentry.close(2000);
  } catch {
    return Promise.resolve(true);
  }
}
