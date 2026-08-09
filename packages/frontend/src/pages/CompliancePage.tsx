import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { complianceApi, type CompliancePolicy, type ComplianceAudit, type ConsentLog, type BreachLog } from '../lib/api';
import { Modal, Input, Button, Badge, EmptyState, PageLoader } from '../components/ui';
import { Shield, ScrollText, AlertTriangle, UserCheck, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDateTime } from '../lib/format';

type TabType = 'policies' | 'audits' | 'consents' | 'breaches';

export default function CompliancePage() {
  const { t } = useTranslation();

  const [tab, setTab] = useState<TabType>('policies');
  const [policies, setPolicies] = useState<CompliancePolicy[]>([]);
  const [audits, setAudits] = useState<ComplianceAudit[]>([]);
  const [consents, setConsents] = useState<ConsentLog[]>([]);
  const [breaches, setBreaches] = useState<BreachLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState<CompliancePolicy | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [polData, audData, conData, breData] = await Promise.allSettled([
          complianceApi.listPolicies(),
          complianceApi.listAudits(),
          complianceApi.listConsents(),
          complianceApi.listBreaches(),
        ]);
        if (!cancelled) {
          if (polData.status === 'fulfilled') setPolicies(polData.value);
          if (audData.status === 'fulfilled') setAudits(audData.value);
          if (conData.status === 'fulfilled') setConsents(conData.value);
          if (breData.status === 'fulfilled') setBreaches(breData.value);
          if (polData.status === 'rejected' && audData.status === 'rejected') {
            toast.error(t('compliance.loadFailed'));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [t]);

  const filteredPolicies = policies.filter((p) => {
    if (!search) return true;
    return p.title.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase());
  });

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('compliance.title')}</h1>
        </div>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button variant={tab === 'policies' ? 'primary' : 'secondary'} onClick={() => { setTab('policies'); setSearch(''); }}
          icon={<ScrollText className="w-4 h-4" />}>
          {t('compliance.policies')} ({policies.length})
        </Button>
        <Button variant={tab === 'audits' ? 'primary' : 'secondary'} onClick={() => { setTab('audits'); setSearch(''); }}
          icon={<Search className="w-4 h-4" />}>
          {t('compliance.audits')} ({audits.length})
        </Button>
        <Button variant={tab === 'consents' ? 'primary' : 'secondary'} onClick={() => { setTab('consents'); setSearch(''); }}
          icon={<UserCheck className="w-4 h-4" />}>
          {t('compliance.consents')} ({consents.length})
        </Button>
        <Button variant={tab === 'breaches' ? 'primary' : 'secondary'} onClick={() => { setTab('breaches'); setSearch(''); }}
          icon={<AlertTriangle className="w-4 h-4" />}>
          {t('compliance.breaches')} ({breaches.length})
        </Button>
      </div>

      {/* Search */}
      {tab === 'policies' && (
        <div className="mb-4 max-w-md">
          <Input placeholder={t('compliance.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {/* Policies Tab */}
      {tab === 'policies' && (
        filteredPolicies.length === 0 ? (
          <EmptyState icon={<Shield className="w-8 h-8 text-gray-400" />} title={t('compliance.noPolicies')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.code')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.titleField')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.category')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.status')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.effectiveDate')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.reviewDate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredPolicies.map((pol) => (
                    <tr key={pol.id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => setSelectedPolicy(pol)}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">{pol.code}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{pol.title}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge>{pol.category}</Badge></td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={pol.status === 'active' ? 'success' : pol.status === 'draft' ? 'warning' : 'gray'}>{pol.status}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pol.effectiveDate || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pol.reviewDate || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Audits Tab */}
      {tab === 'audits' && (
        audits.length === 0 ? (
          <EmptyState title={t('compliance.noAudits')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.titleField')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.type')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.auditor')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.scheduledDate')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {audits.map((audit) => (
                    <tr key={audit.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{audit.title}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge>{audit.type}</Badge></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{audit.auditor || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{audit.scheduledDate || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={audit.status === 'completed' ? 'success' : audit.status === 'in_progress' ? 'warning' : 'gray'}>{audit.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Consents Tab */}
      {tab === 'consents' && (
        consents.length === 0 ? (
          <EmptyState title={t('compliance.noConsents')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.patient')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.consentType')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.granted')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.effectiveDate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {consents.map((consent) => (
                    <tr key={consent.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{consent.patientName}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge>{consent.consentType}</Badge></td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={consent.granted ? 'success' : 'danger'}>{consent.granted ? t('compliance.granted') : t('compliance.denied')}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDateTime(consent.consentedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Breaches Tab */}
      {tab === 'breaches' && (
        breaches.length === 0 ? (
          <EmptyState title={t('compliance.noBreaches')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.type')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.severity')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.detectedDate')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.affectedRecords')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('compliance.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {breaches.map((breach) => (
                    <tr key={breach.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{breach.type}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={breach.severity === 'high' || breach.severity === 'critical' ? 'danger' : breach.severity === 'medium' ? 'warning' : 'info'}>{breach.severity}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{breach.detectedDate}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{breach.affectedRecords}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={breach.status === 'resolved' || breach.status === 'closed' ? 'success' : breach.status === 'investigating' ? 'warning' : 'danger'}>{breach.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Policy Detail Modal */}
      <Modal
        open={!!selectedPolicy}
        onClose={() => setSelectedPolicy(null)}
        title={selectedPolicy?.title || ''}
        size="lg"
      >
        {selectedPolicy && (
          <div className="space-y-3 text-sm">
            <p><strong>{t('compliance.code')}:</strong> {selectedPolicy.code}</p>
            <p><strong>{t('compliance.category')}:</strong> {selectedPolicy.category}</p>
            <p><strong>{t('compliance.status')}:</strong> {selectedPolicy.status}</p>
            {selectedPolicy.description && (
              <p><strong>{t('compliance.description')}:</strong> {selectedPolicy.description}</p>
            )}
            {selectedPolicy.content && (
              <div>
                <strong>{t('compliance.content')}:</strong>
                <p className="mt-1 p-3 bg-gray-50 rounded text-xs max-h-60 overflow-y-auto whitespace-pre-wrap">{selectedPolicy.content}</p>
              </div>
            )}
            <p>
              <strong>{t('compliance.effectiveDate')}:</strong> {selectedPolicy.effectiveDate || '-'} |
              <strong> {t('compliance.reviewDate')}:</strong> {selectedPolicy.reviewDate || '-'}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
