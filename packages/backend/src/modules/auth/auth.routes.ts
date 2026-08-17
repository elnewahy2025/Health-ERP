import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { loginRateLimit, registerRateLimit, forgotPasswordRateLimit, refreshRateLimit } from '../../utils/rate-limiter.js';
import {
  registerTenant, login, mfaVerify, refreshToken, logout, me, switchMembership,
  listUserMemberships, createMembership, updateMembership, revokeMembership,
  listSessions, revokeSession, forgotPassword, resetPassword, changePassword,
  verifyEmail, resendVerification, mfaSetup, mfaEnable, mfaDisable,
  sendOtp, verifyOtpHandler,
} from './auth.controller.js';

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/v1/tenants', { preHandler: [registerRateLimit] }, registerTenant);
  app.post('/api/v1/auth/login', { preHandler: [loginRateLimit] }, login);
  app.post('/api/v1/auth/mfa/verify', mfaVerify);
  app.post('/api/v1/auth/refresh', { preHandler: [refreshRateLimit] }, refreshToken);
  // Logout must work even when the short-lived access token has expired - the
  // handler resolves the session from the refresh token itself.
  app.post('/api/v1/auth/logout', logout);
  app.get('/api/v1/auth/me', { preHandler: [authenticate] }, me);
  app.post('/api/v1/auth/membership/switch', { preHandler: [authenticate] }, switchMembership);
  app.get('/api/v1/auth/memberships/users/:userId', { preHandler: [authenticate, authorize('users.manage')] }, listUserMemberships);
  app.post('/api/v1/auth/memberships/users/:userId', { preHandler: [authenticate, authorize('users.manage')] }, createMembership);
  app.put('/api/v1/auth/memberships/:membershipId', { preHandler: [authenticate, authorize('users.manage')] }, updateMembership);
  app.delete('/api/v1/auth/memberships/:membershipId', { preHandler: [authenticate, authorize('users.manage')] }, revokeMembership);
  app.get('/api/v1/auth/sessions', { preHandler: [authenticate] }, listSessions);
  app.delete('/api/v1/auth/sessions/:sessionId', { preHandler: [authenticate] }, revokeSession);
  app.post('/api/v1/auth/forgot-password', { preHandler: [forgotPasswordRateLimit] }, forgotPassword);
  app.post('/api/v1/auth/reset-password', resetPassword);
  app.post('/api/v1/auth/change-password', { preHandler: [authenticate] }, changePassword);
  app.post('/api/v1/auth/verify-email', verifyEmail);
  app.post('/api/v1/auth/resend-verification', { preHandler: [forgotPasswordRateLimit] }, resendVerification);
  app.post('/api/v1/auth/mfa/setup', { preHandler: [authenticate] }, mfaSetup);
  app.post('/api/v1/auth/mfa/enable', { preHandler: [authenticate] }, mfaEnable);
  app.post('/api/v1/auth/mfa/disable', { preHandler: [authenticate] }, mfaDisable);
  app.post('/api/v1/auth/otp/send', sendOtp);
  app.post('/api/v1/auth/otp/verify', verifyOtpHandler);
}
