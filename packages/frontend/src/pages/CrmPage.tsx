import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { crmApi, type CrmCampaign, type PatientFeedback } from '../lib/api';
import { Modal, Input, Select, Button, Badge, EmptyState, PageLoader } from '../components/ui';
import { Plus, BarChart3, MessageSquare } from 'lucide-react';
import { sanitizeNumber, sanitizeString } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';
import toast from 'react-hot-toast';
import { Can } from '../components/auth/Authorization';
import { useClinicMoney } from '../stores/clinicConfigurationStore';

type TabType = 'campaigns' | 'feedback';

interface CampaignForm {
  name: string;
  type: string;
  description: string;
  startDate: string;
  endDate: string;
  budget: number;
  targetCount: number;
}

interface CampaignFormErrors {
  name?: string;
}

const CAMPAIGN_TYPES = ['email', 'sms', 'social'] as const;

const INITIAL_CAMPAIGN_FORM: CampaignForm = {
  name: '', type: 'email', description: '', startDate: '', endDate: '', budget: 0, targetCount: 0,
};

function validateCampaignForm(form: CampaignForm, t: (key: string) => string): CampaignFormErrors {
  const errors: CampaignFormErrors = {};
  if (!form.name.trim()) errors.name = t('crm.nameRequired');
  return errors;
}

function renderStars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

export default function CrmPage() {
  const { t } = useTranslation();
  const formatMoney = useClinicMoney();

  const [tab, setTab] = useState<TabType>('campaigns');
  const [campaigns, setCampaigns] = useState<CrmCampaign[]>([]);
  const [feedback, setFeedback] = useState<PatientFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [campaignForm, setCampaignForm] = useState<CampaignForm>(INITIAL_CAMPAIGN_FORM);
  const [campaignErrors, setCampaignErrors] = useState<CampaignFormErrors>({});

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [campData, fbData] = await Promise.allSettled([
          crmApi.listCampaigns(),
          crmApi.listFeedback(),
        ]);
        if (!cancelled) {
          if (campData.status === 'fulfilled') setCampaigns(campData.value);
          if (fbData.status === 'fulfilled') {
            const fb = fbData.value;
            setFeedback(fb.feedback || fb);
          }
          if (campData.status === 'rejected' && fbData.status === 'rejected') {
            toast.error(t('crm.loadFailed'));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [t]);

  const filteredCampaigns = campaigns.filter((c) => {
    if (!search) return true;
    return c.name.toLowerCase().includes(search.toLowerCase()) || c.type.toLowerCase().includes(search.toLowerCase());
  });

  const avgRating = feedback.length
    ? (feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length).toFixed(1)
    : 'N/A';

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateCampaignForm(campaignForm, t);
    setCampaignErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await crmApi.createCampaign({
        name: sanitizeString(campaignForm.name),
        type: campaignForm.type,
        description: campaignForm.description || undefined,
        startDate: campaignForm.startDate || undefined,
        endDate: campaignForm.endDate || undefined,
        budget: campaignForm.budget,
        targetCount: campaignForm.targetCount,
      });
      toast.success(t('crm.createCampaignSuccess'));
      closeCampaignModal();
      const data = await crmApi.listCampaigns();
      setCampaigns(data);
    } catch {
      toast.error(t('crm.createCampaignFailed'));
    } finally {
      setSaving(false);
    }
  };

  const closeCampaignModal = () => {
    setShowCampaignModal(false);
    setCampaignForm(INITIAL_CAMPAIGN_FORM);
    setCampaignErrors({});
  };

  const campaignTypeOptions = CAMPAIGN_TYPES.map((ct) => ({ value: ct, label: t(`crm.${ct}`) }));

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('crm.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('crm.campaignCount', { count: campaigns.length })} · {t('crm.avgRating', { rating: avgRating })}
          </p>
        </div>
        <Can permission="crm.create">
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCampaignModal(true)}>
            {t('crm.newCampaign')}
          </Button>
        </Can>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'campaigns' ? 'primary' : 'secondary'} onClick={() => { setTab('campaigns'); setSearch(''); }}
          icon={<BarChart3 className="w-4 h-4" />}>
          {t('crm.campaigns')} ({campaigns.length})
        </Button>
        <Button variant={tab === 'feedback' ? 'primary' : 'secondary'} onClick={() => { setTab('feedback'); setSearch(''); }}
          icon={<MessageSquare className="w-4 h-4" />}>
          {t('crm.feedback')} ({feedback.length})
        </Button>
      </div>

      {/* Search */}
      {tab === 'campaigns' && (
        <div className="mb-4 max-w-md">
          <Input placeholder={t('crm.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {/* Campaigns Tab */}
      {tab === 'campaigns' && (
        filteredCampaigns.length === 0 ? (
          <EmptyState title={t('crm.noCampaigns')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('crm.campaignName')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('crm.campaignType')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('crm.budget')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('crm.targetCount')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('crm.reachedCount')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('crm.conversionCount')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredCampaigns.map((camp) => (
                    <tr key={camp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{camp.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge>{t(`crm.${camp.type}`)}</Badge></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatMoney(camp.budget)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{camp.targetCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{camp.reachedCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{camp.conversionCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={camp.status === 'active' ? 'success' : camp.status === 'draft' ? 'warning' : 'gray'}>{camp.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Feedback Tab */}
      {tab === 'feedback' && (
        feedback.length === 0 ? (
          <EmptyState title={t('crm.noFeedback')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('crm.patient')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('crm.rating')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('crm.category')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('crm.comment')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('crm.date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {feedback.map((fb) => (
                    <tr key={fb.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{fb.patientName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-500">{renderStars(fb.rating)}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge>{fb.category}</Badge></td>
                      <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">{fb.comment || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDateTime(fb.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* New Campaign Modal */}
      <Modal open={showCampaignModal} onClose={closeCampaignModal} title={t('crm.newCampaign')} size="lg"
        footer={<>
          <Button variant="secondary" onClick={closeCampaignModal}>{t('common.cancel')}</Button>
          <Can permission="crm.create">
            <Button loading={saving} onClick={() => { const f = document.getElementById('campaign-form'); if (f) (f as HTMLFormElement).requestSubmit(); }}>{t('common.save')}</Button>
          </Can>
        </>}
      >
        <form id="campaign-form" onSubmit={handleCreateCampaign} className="space-y-4">
          <Input label={t('crm.campaignName')} value={campaignForm.name}
            onChange={(e) => { setCampaignForm((p) => ({ ...p, name: e.target.value })); setCampaignErrors((p) => ({ ...p, name: undefined })); }}
            error={campaignErrors.name} required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label={t('crm.campaignType')} options={campaignTypeOptions} value={campaignForm.type}
              onChange={(e) => setCampaignForm((p) => ({ ...p, type: e.target.value }))} />
            <Input type="number" label={t('crm.budget')} value={campaignForm.budget} min="0"
              onChange={(e) => setCampaignForm((p) => ({ ...p, budget: sanitizeNumber(e.target.value) }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input type="date" label={t('crm.startDate')} value={campaignForm.startDate}
              onChange={(e) => setCampaignForm((p) => ({ ...p, startDate: e.target.value }))} />
            <Input type="date" label={t('crm.endDate')} value={campaignForm.endDate}
              onChange={(e) => setCampaignForm((p) => ({ ...p, endDate: e.target.value }))} />
          </div>
          <Input type="number" label={t('crm.targetCount')} value={campaignForm.targetCount} min="0"
            onChange={(e) => setCampaignForm((p) => ({ ...p, targetCount: sanitizeNumber(e.target.value) }))} />
          <Input label={t('crm.description')} value={campaignForm.description}
            onChange={(e) => setCampaignForm((p) => ({ ...p, description: e.target.value }))} />
        </form>
      </Modal>
    </div>
  );
}
