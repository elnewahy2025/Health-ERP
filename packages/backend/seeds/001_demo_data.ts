import crypto from "crypto";
import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';

export async function seed(knex: Knex): Promise<void> {
  await knex('audit_logs').del();
  await knex('booking_requests').del();
  await knex('booking_slots').del();
  await knex('payment_transactions').del();
  await knex('invoices').del();
  await knex('emr_records').del();
  await knex('appointments').del();
  await knex('patients').del();
  await knex('users').del();
  await knex('roles').del();
  await knex('branches').del();
  await knex('tenants').del();

  // Demo tenant
  const [tenant] = await knex('tenants').insert({
    name: 'Vision Healthcare Demo',
    slug: 'demo',
    locale: 'en',
    timezone: 'Asia/Riyadh',
    settings: JSON.stringify({
      dateFormat: 'DD/MM/YYYY',
      currency: 'SAR',
      timezone: 'Asia/Riyadh',
      theme: { primaryColor: '#0ea5e9', brandName: 'Vision Healthcare' },
      language: 'en',
      direction: 'ltr',
      features: { telemedicine: true, lab: true, radiology: true },
    }),
    status: 'active',
  }).returning('*');

  const passwordHash = await bcrypt.hash('Admin@123', 12);

  const [adminRole] = await knex('roles').insert({
    tenant_id: tenant.id,
    name: 'Super Admin',
    slug: 'super_admin',
    description: 'Full system access',
    permissions: JSON.stringify([
      'patient:read', 'patient:write', 'patient:delete',
      'appointment:read', 'appointment:write', 'appointment:delete',
      'emr:read', 'emr:write', 'emr:delete',
      'billing:read', 'billing:write', 'billing:delete',
      'admin:access', 'admin:users', 'admin:settings',
      'settings:read', 'settings:write',
    ]),
    is_system: true,
  }).returning('*');

  const [doctorRole] = await knex('roles').insert({
    tenant_id: tenant.id,
    name: 'Doctor',
    slug: 'doctor',
    description: 'Clinical access',
    permissions: JSON.stringify([
      'patient:read', 'patient:write',
      'appointment:read', 'appointment:write',
      'emr:read', 'emr:write',
    ]),
    is_system: true,
  }).returning('*');

  const [receptionistRole] = await knex('roles').insert({
    tenant_id: tenant.id,
    name: 'Receptionist',
    slug: 'receptionist',
    description: 'Front desk access',
    permissions: JSON.stringify([
      'patient:read', 'patient:write',
      'appointment:read', 'appointment:write',
      'billing:read',
    ]),
    is_system: true,
  }).returning('*');

  const [adminUser] = await knex('users').insert({
    tenant_id: tenant.id,
    email: 'admin@demo.com',
    password_hash: passwordHash,
    first_name: 'Admin',
    last_name: 'User',
    role_id: adminRole.id,
    roles: JSON.stringify(['super_admin']),
    permissions: JSON.stringify([
      'patient:read', 'patient:write', 'patient:delete',
      'appointment:read', 'appointment:write', 'appointment:delete',
      'emr:read', 'emr:write', 'emr:delete',
      'billing:read', 'billing:write', 'billing:delete',
      'admin:access', 'admin:users', 'admin:settings',
      'settings:read', 'settings:write',
    ]),
    locale: 'en',
    status: 'active',
    mfa_enabled: false,
    password_changed_at: new Date(),
  }).returning('*');

  const [doctorUser] = await knex('users').insert({
    tenant_id: tenant.id,
    email: 'doctor@demo.com',
    password_hash: await bcrypt.hash('Doctor@123', 12),
    first_name: 'Ahmed',
    last_name: 'Al-Saud',
    role_id: doctorRole.id,
    roles: JSON.stringify(['doctor']),
    permissions: JSON.stringify([
      'patient:read', 'patient:write',
      'appointment:read', 'appointment:write',
      'emr:read', 'emr:write',
    ]),
    locale: 'ar',
    status: 'active',
    mfa_enabled: false,
    password_changed_at: new Date(),
  }).returning('*');

  await knex('users').insert({
    tenant_id: tenant.id,
    email: 'reception@demo.com',
    password_hash: await bcrypt.hash('Recept@123', 12),
    first_name: 'Sarah',
    last_name: 'Smith',
    role_id: receptionistRole.id,
    roles: JSON.stringify(['receptionist']),
    permissions: JSON.stringify([
      'patient:read', 'patient:write',
      'appointment:read', 'appointment:write',
      'billing:read',
    ]),
    locale: 'en',
    status: 'active',
    mfa_enabled: false,
    password_changed_at: new Date(),
  });

  const [mainBranch] = await knex('branches').insert({
    tenant_id: tenant.id,
    name: 'Main Branch',
    code: 'MAIN',
    address: JSON.stringify({ street: '123 Healthcare St', city: 'Riyadh', country: 'Saudi Arabia' }),
    phone: '+966112345678',
    status: 'active',
  }).returning('*');

  await knex('branches').insert({
    tenant_id: tenant.id,
    name: 'North Branch',
    code: 'NORTH',
    address: JSON.stringify({ street: '456 Medical Ave', city: 'Riyadh', country: 'Saudi Arabia' }),
    phone: '+966112345679',
    status: 'active',
  });

  // Booking slots for the demo doctor — next 7 days, 09:00–17:00 every 30 min
  const slotRows: Array<Record<string, unknown>> = [];
  const startMin = 9 * 60;
  const endMin = 17 * 60;
  const slotInterval = 30;
  for (let d = 0; d < 7; d += 1) {
    const date = new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    for (let cur = startMin; cur + slotInterval <= endMin; cur += slotInterval) {
      const h = Math.floor(cur / 60);
      const m = cur % 60;
      const nh = Math.floor((cur + slotInterval) / 60);
      const nm = (cur + slotInterval) % 60;
      slotRows.push({
        tenant_id: tenant.id,
        doctor_id: doctorUser.id,
        branch_id: mainBranch.id,
        date,
        start_time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        end_time: `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`,
        is_available: true,
        slot_type: 'consultation',
      });
    }
  }
  if (slotRows.length > 0) await knex('booking_slots').insert(slotRows);

  const patients = [
    { firstName: 'Mohammed', lastName: 'Al-Otaibi', dob: '1985-06-15', gender: 'male', phone: '+966501234567', bloodType: 'O+' },
    { firstName: 'Fatima', lastName: 'Al-Zahrani', dob: '1990-03-22', gender: 'female', phone: '+966501234568', bloodType: 'A+' },
    { firstName: 'Khalid', lastName: 'Al-Ghamdi', dob: '1978-11-08', gender: 'male', phone: '+966501234569', bloodType: 'B+' },
    { firstName: 'Nora', lastName: 'Al-Shehri', dob: '2000-07-30', gender: 'female', phone: '+966501234570', bloodType: 'AB+' },
    { firstName: 'Faisal', lastName: 'Al-Qahtani', dob: '1965-01-12', gender: 'male', phone: '+966501234571', bloodType: 'A-' },
    { firstName: 'Aisha', lastName: 'Al-Harbi', dob: '1995-09-18', gender: 'female', phone: '+966501234572', bloodType: 'O-' },
    { firstName: 'Sultan', lastName: 'Al-Dosari', dob: '1988-04-25', gender: 'male', phone: '+966501234573', bloodType: 'B-' },
    { firstName: 'Maha', lastName: 'Al-Mutairi', dob: '1992-12-03', gender: 'female', phone: '+966501234574', bloodType: 'AB-' },
  ];

  const patientRecords: any[] = [];
  for (const p of patients) {
    const year = new Date().getFullYear();
    const random = crypto.randomBytes(3).toString("hex").toUpperCase();
    const mrn = `MRN-${year}-${random}`;

    const [patient] = await knex('patients').insert({
      tenant_id: tenant.id,
      medical_record_number: mrn,
      first_name: p.firstName,
      last_name: p.lastName,
      date_of_birth: p.dob,
      gender: p.gender,
      phone: p.phone,
      blood_type: p.bloodType,
      status: 'active',
      preferred_language: 'ar',
    }).returning('*');
    patientRecords.push(patient);
  }

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const appointmentTypes = ['consultation', 'followup', 'checkup', 'procedure'];

  for (let i = 0; i < 5; i++) {
    const patient = patientRecords[i];
    const hour = 9 + i;
    const startTime = `${String(hour).padStart(2, '0')}:00`;
    const endTime = `${String(hour + 1).padStart(2, '0')}:00`;

    await knex('appointments').insert({
      tenant_id: tenant.id,
      patient_id: patient.id,
      doctor_id: adminUser.id,
      appointment_date: i < 3 ? today : tomorrow,
      start_time: startTime,
      end_time: endTime,
      duration: 60,
      type: appointmentTypes[i % appointmentTypes.length],
      status: i < 2 ? 'completed' : 'scheduled',
      reason: `${appointmentTypes[i % appointmentTypes.length]} check`,
      is_walk_in: false,
      is_virtual: false,
    });
  }

  for (let i = 0; i < 3; i++) {
    const patient = patientRecords[i];
    const items = [
      { description: 'Consultation Fee', code: 'CONS-001', quantity: 1, unitPrice: 300, total: 300, type: 'consultation' },
      { description: 'Blood Test - CBC', code: 'LAB-001', quantity: 1, unitPrice: 150, total: 150, type: 'laboratory' },
    ];
    const subtotal = items.reduce((s, item) => s + item.total, 0);
    const tax = subtotal * 0.15;
    const total = subtotal + tax;

    await knex('invoices').insert({
      tenant_id: tenant.id,
      patient_id: patient.id,
      invoice_number: `INV-DEMO-${new Date().getFullYear()}-${String(i + 1).padStart(4, '0')}`,
      items: JSON.stringify(items),
      subtotal,
      discount: 0,
      tax,
      total,
      paid: i === 0 ? total : 0,
      due: i === 0 ? 0 : total,
      status: i === 0 ? 'paid' : 'pending',
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      issued_at: new Date(),
    });
  }

  console.log('Demo data seeded:');
  console.log('  Tenant: demo');
  console.log('  Admin: admin@demo.com / Admin@123');
  console.log('  Doctor: doctor@demo.com / Doctor@123');
  console.log('  Reception: reception@demo.com / Recept@123');
}
