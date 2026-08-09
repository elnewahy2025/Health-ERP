import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import {
  listAppointments, getAppointment, createAppointment, updateAppointment,
  checkInAppointment, completeAppointment, cancelAppointment, todaySummary,
  bulkCreateAppointments, bulkCancelAppointments,
} from './appointment.controller.js';

export async function registerAppointmentRoutes(app: FastifyInstance) {
  app.get('/api/v1/appointments', { preHandler: [authenticate, authorize('appointments.view')] }, listAppointments);
  app.get('/api/v1/appointments/today/summary', { preHandler: [authenticate, authorize('appointments.view')] }, todaySummary);
  app.get('/api/v1/appointments/:appointmentId', { preHandler: [authenticate, authorize('appointments.view')] }, getAppointment);
  app.post('/api/v1/appointments', { preHandler: [authenticate, authorize('appointments.create')] }, createAppointment);
  app.put('/api/v1/appointments/:appointmentId', { preHandler: [authenticate, authorize('appointments.edit')] }, updateAppointment);
  app.post('/api/v1/appointments/:appointmentId/check-in', { preHandler: [authenticate, authorize('appointments.edit')] }, checkInAppointment);
  app.post('/api/v1/appointments/:appointmentId/complete', { preHandler: [authenticate, authorize('appointments.edit')] }, completeAppointment);
  app.post('/api/v1/appointments/:appointmentId/cancel', { preHandler: [authenticate, authorize('appointments.cancel')] }, cancelAppointment);
  app.post('/api/v1/appointments/bulk', { preHandler: [authenticate, authorize('appointments.create')] }, bulkCreateAppointments);
  app.post('/api/v1/appointments/bulk/cancel', { preHandler: [authenticate, authorize('appointments.cancel')] }, bulkCancelAppointments);
}
