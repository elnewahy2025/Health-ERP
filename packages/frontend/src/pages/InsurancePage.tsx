import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { insuranceApi, type InsuranceCompany, type InsuranceClaim } from '../lib/api';
import { Modal, Input, Select, PatientSearchField, Button, Badge, EmptyState, PageLoader } from '../components/ui';
import { Plus, ShieldCheck } from 'lucide-react';
import { sanitizeNumber, sanitizeString } from '../lib/sanitize';
import toast from 'react-hot-toast';
import { useClinicMoney } from '../stores/clinicConfigurationStore';

interface CompanyForm {
  name: string;
  code: string;
  contractType: string;
  discountRate: number;
}

interface ClaimForm {
  patientId: string;
  insuranceId: string;
  claimedAmount: number;
}

interface CompanyFormErrors {
  name?: string;
  code?: string;
}

interface ClaimFormErrors {
  patientId?: string;
  insuranceId?: string;
  claimedAmount?: string;
}

const CONTRACT_TYPES = ['network', 'cashless', 'reimbursement'] as const;

const CLAIM_STATUS_MAP: Record<string, { en: string; ar: string }> = {
  draft: { en: 'Draft', ar: 'مسودة' },
  submitted: { en: 'Submitted', ar: 'مُرسل' },
  approved: { en: 'Approved', ar: 'مُعتمد' },
  denied: { en: 'Denied', ar: 'مُرفوض' },
  paid: { en: 'Paid', ar: 'مدفوع' },
  partial: { en: 'Partial', ar: 'جزئي' },
};

const INITIAL_COMPANY_FORM: CompanyForm = {
  name: '',
  code: '',
  contractType: 'network',
  discountRate: 0,
};

const INITIAL_CLAIM_FORM: ClaimForm = {
  patientId: '',
  insuranceId: '',
  claimedAmount: 0,
};

function validateCompanyForm(form: CompanyForm, t: (key: string) => string): CompanyFormErrors {
  const errors: CompanyFormErrors = {};
  if (!form.name.trim()) errors.name = t('insurance.nameRequired');
  if (!form.code.trim()) errors.code = t('insurance.codeRequired');
  return errors;
}

function validateClaimForm(form: ClaimForm, t: (key: string) => string): ClaimFormErrors {
  const errors: ClaimFormErrors = {};
  if (!form.patientId) errors.patientId = t('insurance.patientRequired');
  if (!form.insuranceId) errors.insuranceId = t('insurance.companyRequired');
  if (!form.claimedAmount || form.claimedAmount <= 0) errors.claimedAmount = t('insurance.amountPositive');
  return errors;
}

type TabType = 'companies' | 'claims';

export default function InsurancePage() {
  const { t } = useTranslation();
  const formatMoney = useClinicMoney();

  const [tab, setTab] = useState<TabType>('companies');
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [companyForm, setCompanyForm] = useState<CompanyForm>(INITIAL_COMPANY_FORM);
  const [companyErrors, setCompanyErrors] = useState<CompanyFormErrors>({});

  const [claimForm, setClaimForm] = useState<ClaimForm>(INITIAL_CLAIM_FORM);
  const [claimErrors, setClaimErrors] = useState<ClaimFormErrors>({});

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [companyData, claimData] = await Promise.allSettled([
          insuranceApi.listCompanies(),
          insuranceApi.listClaims(),
        ]);
        if (!cancelled) {
          if (companyData.status === 'fulfilled') setCompanies(companyData.value);
          if (claimData.status === 'fulfilled') setClaims(claimData.value);
          if (companyData.status === 'rejected' && claimData.status === 'rejected') {
            toast.error(t('insurance.loadFailed'));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [t]);

  const filteredData = (tab === 'companies' ? companies : claims).filter((item) => {
    if (!search) return true;
    const query = search.toLowerCase();
    if (tab === 'companies') {
      const c = item as InsuranceCompany;
      return c.name.toLowerCase().includes(query) || c.code.toLowerCase().includes(query);
    }
    const cl = item as InsuranceClaim;
    return (
      cl.claimNumber.toLowerCase().includes(query) ||
      cl.patientName.toLowerCase().includes(query) ||
      (cl.insuranceName && cl.insuranceName.toLowerCase().includes(query))
    );
  });

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateCompanyForm(companyForm, t);
    setCompanyErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await insuranceApi.createCompany({
        name: sanitizeString(companyForm.name),
        code: sanitizeString(companyForm.code),
        contractType: companyForm.contractType,
        discountRate: companyForm.discountRate,
      });
      toast.success(t('insurance.createSuccess'));
      setShowCompanyModal(false);
      setCompanyForm(INITIAL_COMPANY_FORM);
      setCompanyErrors({});
      const data = await insuranceApi.listCompanies();
      setCompanies(data);
    } catch {
      toast.error(t('insurance.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateClaimForm(claimForm, t);
    setClaimErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await insuranceApi.createClaim({
        patientId: claimForm.patientId,
        insuranceId: claimForm.insuranceId,
        claimedAmount: claimForm.claimedAmount,
      });
      toast.success(t('insurance.claimSuccess'));
      setShowClaimModal(false);
      setClaimForm(INITIAL_CLAIM_FORM);
      setClaimErrors({});
      const data = await insuranceApi.listClaims();
      setClaims(data);
    } catch {
      toast.error(t('insurance.claimFailed'));
    } finally {
      setSaving(false);
    }
  };

  const closeCompanyModal = () => {
    setShowCompanyModal(false);
    setCompanyForm(INITIAL_COMPANY_FORM);
    setCompanyErrors({});
  };

  const closeClaimModal = () => {
    setShowClaimModal(false);
    setClaimForm(INITIAL_CLAIM_FORM);
    setClaimErrors({});
  };

  const contractTypeOptions = CONTRACT_TYPES.map((ct) => ({
    value: ct,
    label: t(`insurance.${ct}`),
  }));

  const companyOptions = companies.map((c) => ({
    value: c.id,
    label: `${c.name} (${c.code})`,
  }));

  const claimStatusLabel = (status: string): string => {
    const locale = t('common.status');
    const isArabic = locale === 'الحالة';
    return CLAIM_STATUS_MAP[status]?.[isArabic ? 'ar' : 'en'] || status;
  };

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('insurance.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('insurance.companyCount', { count: companies.length })}, {t('insurance.claimCount', { count: claims.length })}
          </p>
        </div>
        <Button
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            if (tab === 'companies') setShowCompanyModal(true);
            else setShowClaimModal(true);
          }}
        >
          {tab === 'companies' ? t('insurance.newCompany') : t('insurance.newClaim')}
        </Button>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={tab === 'companies' ? 'primary' : 'secondary'}
          onClick={() => { setTab('companies'); setSearch(''); }}
        >
          {t('insurance.companies')} ({companies.length})
        </Button>
        <Button
          variant={tab === 'claims' ? 'primary' : 'secondary'}
          onClick={() => { setTab('claims'); setSearch(''); }}
        >
          {t('insurance.claims')} ({claims.length})
        </Button>
      </div>

      {/* Search */}
      <div className="mb-4 max-w-md">
        <Input
          placeholder={t('insurance.searchPlaceholder', { type: tab === 'companies' ? t('insurance.companies') : t('insurance.claims') })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Content */}
      {filteredData.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="w-8 h-8 text-gray-400" />}
          title={tab === 'companies' ? t('insurance.noCompanies') : t('insurance.noClaims')}
          message={t('common.noData')}
        />
      ) : tab === 'companies' ? (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('insurance.companyName')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('insurance.companyCode')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('insurance.contractType')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('insurance.discountRate')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {(filteredData as InsuranceCompany[]).map((company) => (
                  <tr key={company.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {company.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">
                      {company.code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge>{t(`insurance.${company.contractType}`)}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {company.discountRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('insurance.claimNumber')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('insurance.patient')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('insurance.insuranceCompany')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('insurance.claimedAmount')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('common.status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('insurance.submissionDate')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {(filteredData as InsuranceClaim[]).map((claim) => (
                  <tr key={claim.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">
                      {claim.claimNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {claim.patientName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {claim.insuranceName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {formatMoney(claim.claimedAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge>{claimStatusLabel(claim.status)}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {claim.submissionDate || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Company Modal */}
      <Modal
        open={showCompanyModal}
        onClose={closeCompanyModal}
        title={t('insurance.newCompany')}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeCompanyModal}>
              {t('common.cancel')}
            </Button>
            <Button loading={saving} onClick={() => {
              const form = document.getElementById('company-form');
              if (form) (form as HTMLFormElement).requestSubmit();
            }}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form id="company-form" onSubmit={handleCreateCompany} className="space-y-4">
          <Input
            label={t('insurance.companyName')}
            value={companyForm.name}
            onChange={(e) => {
              setCompanyForm((prev) => ({ ...prev, name: e.target.value }));
              setCompanyErrors((prev) => ({ ...prev, name: undefined }));
            }}
            error={companyErrors.name}
            required
          />
          <Input
            label={t('insurance.companyCode')}
            value={companyForm.code}
            onChange={(e) => {
              setCompanyForm((prev) => ({ ...prev, code: e.target.value }));
              setCompanyErrors((prev) => ({ ...prev, code: undefined }));
            }}
            error={companyErrors.code}
            required
          />
          <Select
            label={t('insurance.contractType')}
            options={contractTypeOptions}
            value={companyForm.contractType}
            onChange={(e) => setCompanyForm((prev) => ({ ...prev, contractType: e.target.value }))}
          />
          <Input
            type="number"
            step="0.01"
            label={t('insurance.discountRate')}
            value={companyForm.discountRate}
            min="0"
            max="100"
            onChange={(e) => setCompanyForm((prev) => ({ ...prev, discountRate: sanitizeNumber(e.target.value) }))}
          />
        </form>
      </Modal>

      {/* New Claim Modal */}
      <Modal
        open={showClaimModal}
        onClose={closeClaimModal}
        title={t('insurance.newClaim')}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeClaimModal}>
              {t('common.cancel')}
            </Button>
            <Button loading={saving} onClick={() => {
              const form = document.getElementById('claim-form');
              if (form) (form as HTMLFormElement).requestSubmit();
            }}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form id="claim-form" onSubmit={handleCreateClaim} className="space-y-4">
          <PatientSearchField
            value={claimForm.patientId}
            onChange={(patientId) => {
              setClaimForm((prev) => ({ ...prev, patientId }));
              setClaimErrors((prev) => ({ ...prev, patientId: undefined }));
            }}
            error={claimErrors.patientId}
            required
          />
          <Select
            label={t('insurance.selectCompany')}
            options={companyOptions}
            value={claimForm.insuranceId}
            onChange={(e) => {
              setClaimForm((prev) => ({ ...prev, insuranceId: e.target.value }));
              setClaimErrors((prev) => ({ ...prev, insuranceId: undefined }));
            }}
            error={claimErrors.insuranceId}
            placeholder={t('insurance.selectCompany')}
          />
          <Input
            type="number"
            step="0.01"
            label={t('insurance.claimedAmount')}
            value={claimForm.claimedAmount}
            min="0"
            onChange={(e) => {
              setClaimForm((prev) => ({ ...prev, claimedAmount: sanitizeNumber(e.target.value) }));
              setClaimErrors((prev) => ({ ...prev, claimedAmount: undefined }));
            }}
            error={claimErrors.claimedAmount}
            required
          />
        </form>
      </Modal>
    </div>
  );
}
