import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { listPatients, getPatient, createPatient, updatePatient, deletePatient, quickSearch, mergePatients, bulkImport } from './patient.controller.js';

export async function registerPatientRoutes(app: FastifyInstance) {
  app.get('/api/v1/patients', { preHandler: [authenticate, authorize('patients.view')] }, listPatients);
  app.get('/api/v1/patients/search/quick', { preHandler: [authenticate, authorize('patients.view')] }, quickSearch);
  app.get('/api/v1/patients/:patientId', { preHandler: [authenticate, authorize('patients.view')] }, getPatient);
  app.post('/api/v1/patients', { preHandler: [authenticate, authorize('patients.create')] }, createPatient);
  app.put('/api/v1/patients/:patientId', { preHandler: [authenticate, authorize('patients.edit')] }, updatePatient);
  app.delete('/api/v1/patients/:patientId', { preHandler: [authenticate, authorize('patients.delete')] }, deletePatient);
  app.post('/api/v1/patients/merge', { preHandler: [authenticate, authorize('patients.manage')] }, mergePatients);
  app.post('/api/v1/patients/bulk-import', { preHandler: [authenticate, authorize('patients.manage')] }, bulkImport);
}
