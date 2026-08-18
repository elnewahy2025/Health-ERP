import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { hrApi, type Employee, type LeaveRequest, type PayrollRun } from '../lib/api';
import { Modal, Input, Select, Button, Badge, EmptyState, PageLoader } from '../components/ui';
import { Plus, UsersRound, CalendarCheck, Banknote } from 'lucide-react';
import { sanitizeString } from '../lib/sanitize';
import toast from 'react-hot-toast';
import { Can } from '../components/auth/Authorization';
import { useClinicMoney } from '../stores/clinicConfigurationStore';

type TabType = 'employees' | 'leave' | 'payroll';

interface EmployeeForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  employmentType: string;
  hireDate: string;
  baseSalary: number;
  payFrequency: string;
}

interface LeaveForm {
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
}

interface EmployeeFormErrors {
  firstName?: string;
  lastName?: string;
  department?: string;
}

interface LeaveFormErrors {
  employeeId?: string;
  startDate?: string;
  endDate?: string;
}

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'intern'] as const;
const LEAVE_TYPES = ['annual', 'sick', 'personal', 'maternity', 'unpaid'] as const;
const PAY_FREQUENCIES = ['monthly', 'weekly', 'biweekly'] as const;

const INITIAL_EMPLOYEE_FORM: EmployeeForm = {
  firstName: '', lastName: '', email: '', phone: '',
  department: '', position: '', employmentType: 'full_time',
  hireDate: '', baseSalary: 0, payFrequency: 'monthly',
};

const INITIAL_LEAVE_FORM: LeaveForm = {
  employeeId: '', leaveType: 'annual', startDate: '', endDate: '', reason: '',
};

function validateEmployeeForm(form: EmployeeForm, t: (key: string) => string): EmployeeFormErrors {
  const errors: EmployeeFormErrors = {};
  if (!form.firstName.trim()) errors.firstName = t('hr.firstNameRequired');
  if (!form.lastName.trim()) errors.lastName = t('hr.lastNameRequired');
  if (!form.department.trim()) errors.department = t('hr.departmentRequired');
  return errors;
}

function validateLeaveForm(form: LeaveForm, t: (key: string) => string): LeaveFormErrors {
  const errors: LeaveFormErrors = {};
  if (!form.employeeId) errors.employeeId = t('hr.firstNameRequired');
  if (!form.startDate) errors.startDate = t('hr.startDateRequired');
  if (!form.endDate) errors.endDate = t('hr.endDateRequired');
  return errors;
}

export default function HrPage() {
  const { t } = useTranslation();
  const formatMoney = useClinicMoney();

  const [tab, setTab] = useState<TabType>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payrolls, setPayrolls] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(INITIAL_EMPLOYEE_FORM);
  const [employeeErrors, setEmployeeErrors] = useState<EmployeeFormErrors>({});
  const [leaveForm, setLeaveForm] = useState<LeaveForm>(INITIAL_LEAVE_FORM);
  const [leaveErrors, setLeaveErrors] = useState<LeaveFormErrors>({});

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [empData, leaveData, payrollData] = await Promise.allSettled([
          hrApi.listEmployees(),
          hrApi.listLeaveRequests(),
          hrApi.listPayroll(),
        ]);
        if (!cancelled) {
          if (empData.status === 'fulfilled') setEmployees(empData.value);
          if (leaveData.status === 'fulfilled') setLeaves(leaveData.value);
          if (payrollData.status === 'fulfilled') setPayrolls(payrollData.value);
          if (empData.status === 'rejected' && leaveData.status === 'rejected') {
            toast.error(t('hr.loadFailed'));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [t]);

  const filteredEmployees = employees.filter((emp) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      emp.firstName.toLowerCase().includes(q) ||
      emp.lastName.toLowerCase().includes(q) ||
      emp.department.toLowerCase().includes(q) ||
      emp.employeeCode.toLowerCase().includes(q)
    );
  });

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateEmployeeForm(employeeForm, t);
    setEmployeeErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await hrApi.createEmployee({
        firstName: sanitizeString(employeeForm.firstName),
        lastName: sanitizeString(employeeForm.lastName),
        email: sanitizeString(employeeForm.email),
        phone: employeeForm.phone,
        department: sanitizeString(employeeForm.department),
        position: sanitizeString(employeeForm.position),
        employmentType: employeeForm.employmentType,
        hireDate: employeeForm.hireDate || undefined,
        baseSalary: employeeForm.baseSalary,
        payFrequency: employeeForm.payFrequency,
      });
      toast.success(t('hr.createEmployeeSuccess'));
      closeEmployeeModal();
      const data = await hrApi.listEmployees();
      setEmployees(data);
    } catch {
      toast.error(t('hr.createEmployeeFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateLeaveForm(leaveForm, t);
    setLeaveErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await hrApi.createLeaveRequest({
        employeeId: leaveForm.employeeId,
        leaveType: leaveForm.leaveType,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        reason: leaveForm.reason,
      });
      toast.success(t('hr.createLeaveSuccess'));
      closeLeaveModal();
      const data = await hrApi.listLeaveRequests();
      setLeaves(data);
    } catch {
      toast.error(t('hr.createLeaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const closeEmployeeModal = () => {
    setShowEmployeeModal(false);
    setEmployeeForm(INITIAL_EMPLOYEE_FORM);
    setEmployeeErrors({});
  };

  const closeLeaveModal = () => {
    setShowLeaveModal(false);
    setLeaveForm(INITIAL_LEAVE_FORM);
    setLeaveErrors({});
  };

  const openNewModal = () => {
    if (tab === 'employees') setShowEmployeeModal(true);
    else if (tab === 'leave') setShowLeaveModal(true);
  };

  const empTypeOptions = EMPLOYMENT_TYPES.map((et) => ({ value: et, label: t(`hr.${et}`) }));
  const leaveTypeOptions = LEAVE_TYPES.map((lt) => ({ value: lt, label: t(`hr.${lt}`) }));
  const payFreqOptions = PAY_FREQUENCIES.map((pf) => ({ value: pf, label: t(`hr.${pf}`) }));

  const empName = (emp: Employee) => `${emp.firstName} ${emp.lastName}`;

  const leaveEmployeeOptions = employees.map((emp) => ({
    value: emp.id,
    label: `${emp.firstName} ${emp.lastName} (${emp.employeeCode})`,
  }));

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('hr.title')}</h1>
          <p className="text-gray-500 mt-1">{t('hr.employeeCountLabel', { count: employees.length })}</p>
        </div>
        {tab !== 'payroll' && (
          <Can permission="hr.create">
            <Button icon={<Plus className="w-4 h-4" />} onClick={openNewModal}>
              {tab === 'employees' ? t('hr.addEmployee') : t('hr.newLeaveRequest')}
            </Button>
          </Can>
        )}
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button variant={tab === 'employees' ? 'primary' : 'secondary'} onClick={() => { setTab('employees'); setSearch(''); }}
          icon={<UsersRound className="w-4 h-4" />}>
          {t('hr.employees')} ({employees.length})
        </Button>
        <Button variant={tab === 'leave' ? 'primary' : 'secondary'} onClick={() => { setTab('leave'); setSearch(''); }}
          icon={<CalendarCheck className="w-4 h-4" />}>
          {t('hr.leave')} ({leaves.length})
        </Button>
        <Button variant={tab === 'payroll' ? 'primary' : 'secondary'} onClick={() => { setTab('payroll'); setSearch(''); }}
          icon={<Banknote className="w-4 h-4" />}>
          {t('hr.payroll')} ({payrolls.length})
        </Button>
      </div>

      {/* Search */}
      {tab !== 'payroll' && (
        <div className="mb-4 max-w-md">
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Employees Tab */}
      {tab === 'employees' && (
        filteredEmployees.length === 0 ? (
          <EmptyState title={t('hr.noEmployees')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.employeeCode')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.firstName')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.department')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.position')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.employmentType')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">{emp.employeeCode}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{empName(emp)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{emp.department}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{emp.position}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge>{t(`hr.${emp.employmentType}`)}</Badge></td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={emp.status === 'active' ? 'success' : 'warning'}>{emp.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Leave Tab */}
      {tab === 'leave' && (
        leaves.length === 0 ? (
          <EmptyState title={t('hr.noLeaveRequests')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.employees')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.leaveType')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.startDate')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.endDate')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.totalDays')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {leaves.map((lr) => (
                    <tr key={lr.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{lr.employeeName}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge>{t(`hr.${lr.leaveType}`)}</Badge></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{lr.startDate}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{lr.endDate}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{lr.totalDays}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={lr.status === 'approved' ? 'success' : lr.status === 'pending' ? 'warning' : 'danger'}>{lr.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Payroll Tab */}
      {tab === 'payroll' && (
        payrolls.length === 0 ? (
          <EmptyState title={t('hr.noPayrollRuns')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.periodName')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.periodStart')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.periodEnd')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.gross')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.net')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hr.employeeCount')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {payrolls.map((pr) => (
                    <tr key={pr.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{pr.periodName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pr.periodStart}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pr.periodEnd}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatMoney(pr.totalGross)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">{formatMoney(pr.totalNet)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{pr.employeeCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge>{pr.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* New Employee Modal */}
      <Modal open={showEmployeeModal} onClose={closeEmployeeModal} title={t('hr.addEmployee')} size="lg"
        footer={<>
          <Button variant="secondary" onClick={closeEmployeeModal}>{t('common.cancel')}</Button>
          <Can permission="hr.create">
            <Button loading={saving} onClick={() => { const f = document.getElementById('emp-form'); if (f) (f as HTMLFormElement).requestSubmit(); }}>{t('common.save')}</Button>
          </Can>
        </>}
      >
        <form id="emp-form" onSubmit={handleCreateEmployee} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('hr.firstName')} value={employeeForm.firstName}
              onChange={(e) => { setEmployeeForm((p) => ({ ...p, firstName: e.target.value })); setEmployeeErrors((p) => ({ ...p, firstName: undefined })); }}
              error={employeeErrors.firstName} required />
            <Input label={t('hr.lastName')} value={employeeForm.lastName}
              onChange={(e) => { setEmployeeForm((p) => ({ ...p, lastName: e.target.value })); setEmployeeErrors((p) => ({ ...p, lastName: undefined })); }}
              error={employeeErrors.lastName} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input type="email" label={t('hr.email')} value={employeeForm.email}
              onChange={(e) => setEmployeeForm((p) => ({ ...p, email: e.target.value }))} />
            <Input label={t('hr.phone')} value={employeeForm.phone}
              onChange={(e) => setEmployeeForm((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('hr.department')} value={employeeForm.department}
              onChange={(e) => { setEmployeeForm((p) => ({ ...p, department: e.target.value })); setEmployeeErrors((p) => ({ ...p, department: undefined })); }}
              error={employeeErrors.department} required />
            <Input label={t('hr.position')} value={employeeForm.position}
              onChange={(e) => setEmployeeForm((p) => ({ ...p, position: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label={t('hr.employmentType')} options={empTypeOptions} value={employeeForm.employmentType}
              onChange={(e) => setEmployeeForm((p) => ({ ...p, employmentType: e.target.value }))} />
            <Select label={t('hr.payFrequency')} options={payFreqOptions} value={employeeForm.payFrequency}
              onChange={(e) => setEmployeeForm((p) => ({ ...p, payFrequency: e.target.value }))} />
            <Input type="date" label={t('hr.hireDate')} value={employeeForm.hireDate}
              onChange={(e) => setEmployeeForm((p) => ({ ...p, hireDate: e.target.value }))} />
          </div>
          <Input type="number" label={t('hr.baseSalary')} value={employeeForm.baseSalary} min="0"
            onChange={(e) => setEmployeeForm((p) => ({ ...p, baseSalary: Number(e.target.value) }))} />
        </form>
      </Modal>

      {/* New Leave Modal */}
      <Modal open={showLeaveModal} onClose={closeLeaveModal} title={t('hr.newLeaveRequest')} size="md"
        footer={<>
          <Button variant="secondary" onClick={closeLeaveModal}>{t('common.cancel')}</Button>
          <Can permission="hr.create">
            <Button loading={saving} onClick={() => { const f = document.getElementById('leave-form'); if (f) (f as HTMLFormElement).requestSubmit(); }}>{t('common.save')}</Button>
          </Can>
        </>}
      >
        <form id="leave-form" onSubmit={handleCreateLeave} className="space-y-4">
          <Select label={t('hr.employees')} options={leaveEmployeeOptions} value={leaveForm.employeeId}
            onChange={(e) => { setLeaveForm((p) => ({ ...p, employeeId: e.target.value })); setLeaveErrors((p) => ({ ...p, employeeId: undefined })); }}
            error={leaveErrors.employeeId} placeholder={t('hr.employees')} />
          <Select label={t('hr.leaveType')} options={leaveTypeOptions} value={leaveForm.leaveType}
            onChange={(e) => setLeaveForm((p) => ({ ...p, leaveType: e.target.value }))} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input type="date" label={t('hr.startDate')} value={leaveForm.startDate}
              onChange={(e) => { setLeaveForm((p) => ({ ...p, startDate: e.target.value })); setLeaveErrors((p) => ({ ...p, startDate: undefined })); }}
              error={leaveErrors.startDate} required />
            <Input type="date" label={t('hr.endDate')} value={leaveForm.endDate}
              onChange={(e) => { setLeaveForm((p) => ({ ...p, endDate: e.target.value })); setLeaveErrors((p) => ({ ...p, endDate: undefined })); }}
              error={leaveErrors.endDate} required />
          </div>
          <Input label={t('hr.reason')} value={leaveForm.reason}
            onChange={(e) => setLeaveForm((p) => ({ ...p, reason: e.target.value }))} />
        </form>
      </Modal>
    </div>
  );
}
