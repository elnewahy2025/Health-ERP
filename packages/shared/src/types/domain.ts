export interface Address {
  street: string;
  city: string;
  state?: string;
  zipCode?: string;
  country: string;
}

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

export interface PatientInsurance {
  provider: string;
  policyNumber: string;
  planName: string;
  startDate: string;
  endDate: string;
  coverage: number;
  status: 'active' | 'expired' | 'pending';
}

export interface Allergy {
  allergen: string;
  severity: 'mild' | 'moderate' | 'severe';
  reaction: string;
  recordedAt: string;
}

export interface MedicalHistoryEntry {
  condition: string;
  diagnosisDate?: string;
  status: 'active' | 'resolved' | 'managed';
  notes?: string;
}

export type PatientStatus = 'active' | 'inactive' | 'deceased' | 'transferred';

export interface Patient {
  id: string;
  tenantId: string;
  branchId: string | null;
  medicalRecordNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'male' | 'female';
  nationality?: string;
  bloodType?: string;
  email?: string;
  phone: string;
  phone2?: string;
  address?: Address;
  emergencyContact?: EmergencyContact;
  insurance?: PatientInsurance[];
  allergies?: Allergy[];
  medicalHistory?: MedicalHistoryEntry[];
  maritalStatus?: string;
  occupation?: string;
  preferredLanguage: 'ar' | 'en';
  profileImage?: string;
  status: PatientStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type AppointmentType = 'consultation' | 'followup' | 'emergency' | 'checkup' | 'procedure' | 'telemedicine' | 'vaccination';

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'checked_in' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';

export interface AppointmentReminder {
  type: 'sms' | 'email' | 'whatsapp' | 'push';
  sentAt: string;
  status: 'sent' | 'failed' | 'pending';
}

export interface Appointment {
  id: string;
  tenantId: string;
  patientId: string;
  patientName?: string;
  patientMrn?: string;
  doctorId: string;
  doctorName?: string;
  branchId: string;
  appointmentDate: string;
  startTime: string;
  endTime?: string;
  duration: number;
  type: AppointmentType;
  status: AppointmentStatus;
  reason?: string;
  notes?: string;
  isWalkIn: boolean;
  isVirtual: boolean;
  telemedicineLink?: string;
  reminderSent: boolean;
  reminders: AppointmentReminder[];
  checkInTime?: string;
  checkOutTime?: string;
  cancelledAt?: string;
  cancelReason?: string;
  rescheduledFrom?: string;
  createdAt: string;
  updatedAt: string;
}

export type EncounterType = 'new' | 'followup' | 'emergency' | 'annual' | 'preoperative' | 'postoperative' | 'telemedicine';
export type EMRStatus = 'draft' | 'completed' | 'signed' | 'amended';

export interface Diagnosis {
  code: string;
  name: string;
  type: 'primary' | 'secondary' | 'complication';
  notes?: string;
}

export interface Procedure {
  code: string;
  name: string;
  date: string;
  notes?: string;
}

export interface PrescribedMedication {
  drugName: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: number;
  refills: number;
  instructions?: string;
  prescribedAt: string;
}

export interface Vitals {
  bloodPressureSystolic: number;
  bloodPressureDiastolic: number;
  heartRate: number;
  respiratoryRate: number;
  temperature: number;
  oxygenSaturation: number;
  height: number;
  weight: number;
  bmi: number;
  painLevel: number;
  recordedAt: string;
}

export interface EMRRecord {
  id: string;
  tenantId: string;
  patientId: string;
  patientName?: string;
  patientMrn?: string;
  appointmentId?: string;
  doctorId: string;
  encounterDate: string;
  encounterType: EncounterType;
  chiefComplaint?: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  diagnosis: Diagnosis[];
  procedures: Procedure[];
  medications: PrescribedMedication[];
  labOrders: string[];
  radiologyOrders: string[];
  vitals?: Vitals;
  notes?: string;
  status: EMRStatus;
  createdAt: string;
  updatedAt: string;
}

export type InvoiceStatus = 'draft' | 'pending' | 'partial' | 'paid' | 'cancelled' | 'refunded' | 'overdue';
export type PaymentMethod = 'cash' | 'card' | 'insurance' | 'bank_transfer' | 'online' | 'wallet';

export interface InvoiceItem {
  description: string;
  code: string;
  quantity: number;
  unitPrice: number;
  total: number;
  type: 'consultation' | 'procedure' | 'medication' | 'laboratory' | 'radiology' | 'supply' | 'other';
}

export interface Invoice {
  id: string;
  tenantId: string;
  patientId: string;
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
  appointmentId?: string;
  invoiceNumber: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  due: number;
  status: InvoiceStatus;
  paymentMethod?: PaymentMethod;
  insuranceClaim?: string;
  notes?: string;
  dueDate: string;
  issuedAt: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LabTest {
  id: string;
  testCode: string;
  testName: string;
  category: string;
  specimenType: string;
  referenceRange: string;
  unit: string;
  price: number;
}

export interface LabOrder {
  id: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  status: string;
  priority: string;
  orderDate: string;
  clinicalNotes?: string;
  resultsSummary?: string;
  createdAt: string;
}

export interface RadiologyOrder {
  id: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  studyType: string;
  bodyPart?: string;
  status: string;
  priority: string;
  orderDate: string;
  scheduledDate?: string;
  clinicalIndication?: string;
  findings?: string;
  impression?: string;
  report?: string;
  dicomLink?: string;
  createdAt: string;
}

export interface PharmacyInventory {
  id: string;
  drugName: string;
  genericName?: string;
  brandName?: string;
  dosageForm: string;
  strength?: string;
  stockQuantity: number;
  reorderLevel: number;
  unitPrice: number;
  batchNumber?: string;
  expiryDate?: string;
  manufacturer?: string;
  requiresPrescription: boolean;
  status: string;
}

export interface PrescriptionItem {
  id: string;
  drugName: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: number;
  quantityDispensed: number;
  refills: number;
  instructions?: string;
  status: string;
}

export interface Prescription {
  id: string;
  prescriptionNumber: string;
  patientId: string;
  patientName: string;
  status: string;
  notes?: string;
  items: PrescriptionItem[];
  createdAt: string;
}

export interface QueueEntry {
  id: string;
  queueNumber: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  serviceType: string;
  doctorId?: string;
  branchId?: string;
  status: string;
  priority: number;
  position: number;
  calledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface Referral {
  id: string;
  referralNumber: string;
  patientId: string;
  patientName: string;
  referralType: string;
  priority: string;
  status: string;
  reason?: string;
  clinicalNotes?: string;
  feedback?: string;
  referringDoctorId: string;
  receivingDoctorId?: string;
  receivingDoctorName?: string;
  externalFacility?: string;
  externalDoctor?: string;
  referralDate: string;
  consentObtained: boolean;
  createdAt: string;
}

export interface NursingTask {
  id: string;
  title: string;
  description?: string;
  category: string;
  priority: string;
  status: string;
  patientId: string;
  patientName: string;
  assignedTo?: string;
  dueAt?: string;
  completedAt?: string;
  completionNotes?: string;
  createdAt: string;
}

export interface HomeVisit {
  id: string;
  visitNumber: string;
  patientId: string;
  patientName: string;
  visitType: string;
  scheduledDate: string;
  scheduledTime?: string;
  address?: string;
  notes?: string;
  clinicalNotes?: string;
  assignedTo: string;
  assignedToName: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface TelemedicineSession {
  id: string;
  sessionId: string;
  roomName: string;
  status: string;
  provider: string;
  meetingLink: string | null;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string | null;
  appointmentId?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds: number | null;
  recordingEnabled: boolean;
  notes: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string | null;
  status: string;
  referenceType: string | null;
  referenceId: string | null;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  address: Address;
  phone: string;
  email?: string;
  status: 'active' | 'inactive';
  timezone: string;
  createdAt: string;
  updatedAt: string;
}
