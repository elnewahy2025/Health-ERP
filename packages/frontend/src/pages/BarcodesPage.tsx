import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Barcode, Scan, Plus, Printer } from 'lucide-react';
import {
  PageLoader, EmptyState, Card, CardBody, Button, Badge, Input, Modal,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';

type BarcodeTab = 'templates' | 'labels' | 'scans';

interface BarcodeTemplate {
  id: string;
  name: string;
  code: string;
  category: string;
  symbology: string;
  format: string;
  includeHumanReadable: boolean;
  isActive: boolean;
  isDefault: boolean;
}

interface BarcodeLabel {
  id: string;
  templateId: string;
  templateName: string;
  symbology: string;
  referenceType: string | null;
  referenceId: string | null;
  barcodeData: string;
  format: string;
  status: string;
  printCount: number;
  expiresAt: string | null;
  createdAt: string;
}

interface ScanLog {
  id: string;
  labelId: string | null;
  barcodeData: string;
  scannerId: string | null;
  location: string | null;
  action: string;
  status: string;
  notes: string | null;
  referenceType: string | null;
  referenceId: string | null;
  scannedBy: string;
  scannedAt: string;
}

export default function BarcodesPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<BarcodeTab>('templates');
  const [templates, setTemplates] = useState<BarcodeTemplate[]>([]);
  const [labels, setLabels] = useState<BarcodeLabel[]>([]);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showScan, setShowScan] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [tRes, lRes, sRes] = await Promise.allSettled([
        api.get('/barcodes/templates'),
        api.get('/barcodes/labels'),
        api.get('/barcodes/scan-logs'),
      ]);
      if (tRes.status === 'fulfilled') setTemplates((tRes.value.data?.data ?? []) as BarcodeTemplate[]);
      if (lRes.status === 'fulfilled') setLabels((lRes.value.data?.data ?? []) as BarcodeLabel[]);
      if (sRes.status === 'fulfilled') setScanLogs((sRes.value.data?.data ?? []) as ScanLog[]);
    } catch {
      toast.error(t('barcodes.loadError'));
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [tRes, lRes, sRes] = await Promise.allSettled([
          api.get('/barcodes/templates'),
          api.get('/barcodes/labels'),
          api.get('/barcodes/scan-logs'),
        ]);
        if (cancelled) return;
        if (tRes.status === 'fulfilled') setTemplates((tRes.value.data?.data ?? []) as BarcodeTemplate[]);
        if (lRes.status === 'fulfilled') setLabels((lRes.value.data?.data ?? []) as BarcodeLabel[]);
        if (sRes.status === 'fulfilled') setScanLogs((sRes.value.data?.data ?? []) as ScanLog[]);
      } catch {
        if (!cancelled) toast.error(t('barcodes.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [t]);

  const filteredTemplates = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter((tpl) => tpl.name?.toLowerCase().includes(q));
  }, [templates, search]);

  const filteredLabels = useMemo(() => {
    if (!search.trim()) return labels;
    const q = search.toLowerCase();
    return labels.filter(
      (l) => l.barcodeData?.toLowerCase().includes(q) || l.referenceType?.toLowerCase().includes(q)
    );
  }, [labels, search]);

  const handlePrint = useCallback(async (labelId: string) => {
    try {
      await api.post(`/barcodes/labels/${labelId}/print`);
      setLabels((prev) =>
        prev.map((l) => (l.id === labelId ? { ...l, printCount: (l.printCount ?? 0) + 1, status: 'printed' } : l))
      );
      toast.success(t('barcodes.printSuccess'));
    } catch {
      toast.error(t('barcodes.printError'));
    }
  }, [t]);

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('barcodes.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('barcodes.templateCount', { count: templates.length })} · {t('barcodes.labelCount', { count: labels.length })} · {t('barcodes.scanCount', { count: scanLogs.length })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowScan(true)}>
            <Scan className="w-4 h-4" /> {t('barcodes.logScan')}
          </Button>
          <Button onClick={() => setShowGenerate(true)}>
            <Plus className="w-4 h-4" /> {t('barcodes.generate')}
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <Button variant={tab === 'templates' ? 'primary' : 'secondary'} onClick={() => setTab('templates')}>
          <Barcode className="w-4 h-4" /> {t('barcodes.templates')} ({templates.length})
        </Button>
        <Button variant={tab === 'labels' ? 'primary' : 'secondary'} onClick={() => setTab('labels')}>
          <Printer className="w-4 h-4" /> {t('barcodes.labels')} ({labels.length})
        </Button>
        <Button variant={tab === 'scans' ? 'primary' : 'secondary'} onClick={() => setTab('scans')}>
          <Scan className="w-4 h-4" /> {t('barcodes.scanLogs')} ({scanLogs.length})
        </Button>
      </div>

      <Card className="mb-6">
        <CardBody>
          <Input placeholder={t('barcodes.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
        </CardBody>
      </Card>

      {tab === 'templates' && (
        <>
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={() => setShowNewTemplate(true)}>
              <Plus className="w-4 h-4" /> {t('barcodes.newTemplate')}
            </Button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>{t('barcodes.name')}</th>
                  <th>{t('barcodes.code')}</th>
                  <th>{t('barcodes.category')}</th>
                  <th>{t('barcodes.symbology')}</th>
                  <th>{t('barcodes.format')}</th>
                  <th>{t('barcodes.humanReadable')}</th>
                  <th>{t('barcodes.status')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredTemplates.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState title={t('barcodes.noTemplates')} /></td></tr>
                ) : filteredTemplates.map((tpl) => (
                  <tr key={tpl.id} className="hover:bg-gray-50">
                    <td className="font-medium">{sanitizeString(tpl.name)}</td>
                    <td className="font-mono text-xs">{sanitizeString(tpl.code)}</td>
                    <td><Badge>{sanitizeString(tpl.category)}</Badge></td>
                    <td><Badge variant="gray">{sanitizeString(tpl.symbology)}</Badge></td>
                    <td>{sanitizeString(tpl.format)}</td>
                    <td>{tpl.includeHumanReadable ? <Badge variant="success">{t('barcodes.yes')}</Badge> : <Badge variant="gray">{t('barcodes.no')}</Badge>}</td>
                    <td><Badge variant={tpl.isActive ? 'success' : 'gray'}>{tpl.isActive ? t('barcodes.active') : t('barcodes.inactive')}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'labels' && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{t('barcodes.barcodeData')}</th>
                <th>{t('barcodes.template')}</th>
                <th>{t('barcodes.reference')}</th>
                <th>{t('barcodes.format')}</th>
                <th>{t('barcodes.status')}</th>
                <th>{t('barcodes.prints')}</th>
                <th>{t('barcodes.created')}</th>
                <th>{t('barcodes.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLabels.length === 0 ? (
                <tr><td colSpan={8}><EmptyState title={t('barcodes.noLabels')} /></td></tr>
              ) : filteredLabels.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="font-mono text-xs">{sanitizeString(l.barcodeData)}</td>
                  <td className="text-sm">{sanitizeString(l.templateName)}</td>
                  <td className="text-xs">{l.referenceType ? `${sanitizeString(l.referenceType)}:${sanitizeString(l.referenceId ?? '')}` : '-'}</td>
                  <td><Badge variant="gray">{sanitizeString(l.format)}</Badge></td>
                  <td><Badge variant={l.status === 'active' ? 'success' : l.status === 'expired' ? 'danger' : 'gray'}>{sanitizeString(l.status)}</Badge></td>
                  <td className="text-xs">{l.printCount ?? 0}</td>
                  <td className="text-xs">{formatDateTime(l.createdAt)}</td>
                  <td>
                    <Button variant="ghost" size="sm" onClick={() => handlePrint(l.id)}>
                      <Printer className="w-3 h-3" /> {t('barcodes.print')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'scans' && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{t('barcodes.barcodeData')}</th>
                <th>{t('barcodes.action')}</th>
                <th>{t('barcodes.status')}</th>
                <th>{t('barcodes.location')}</th>
                <th>{t('barcodes.reference')}</th>
                <th>{t('barcodes.scannedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {scanLogs.length === 0 ? (
                <tr><td colSpan={6}><EmptyState title={t('barcodes.noScans')} /></td></tr>
              ) : scanLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="font-mono text-xs">{sanitizeString(log.barcodeData)}</td>
                  <td><Badge>{sanitizeString(log.action)}</Badge></td>
                  <td><Badge variant={log.status === 'success' ? 'success' : 'danger'}>{sanitizeString(log.status)}</Badge></td>
                  <td className="text-xs">{sanitizeString(log.location ?? '-')}</td>
                  <td className="text-xs">{log.referenceType ? `${sanitizeString(log.referenceType)}:${sanitizeString(log.referenceId ?? '')}` : '-'}</td>
                  <td className="text-xs">{formatDateTime(log.scannedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showNewTemplate} onClose={() => setShowNewTemplate(false)} title={t('barcodes.createTemplateTitle')} size="lg">
        <NewTemplateForm onDone={() => { setShowNewTemplate(false); void loadData(); }} />
      </Modal>

      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title={t('barcodes.generateTitle')} size="md">
        <GenerateForm templates={templates} onDone={() => { setShowGenerate(false); void loadData(); }} />
      </Modal>

      <Modal open={showScan} onClose={() => setShowScan(false)} title={t('barcodes.scanTitle')} size="md">
        <ScanForm onDone={() => { setShowScan(false); void loadData(); }} />
      </Modal>
    </div>
  );
}

function NewTemplateForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('patient');
  const [symbology, setSymbology] = useState('code128');
  const [format, setFormat] = useState('png');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      setNameError(t('barcodes.name') + ' is required');
      return;
    }
    setNameError('');
    setSaving(true);
    try {
      await api.post('/barcodes/templates', {
        name: sanitizeString(name), category, symbology, format,
      });
      toast.success(t('barcodes.templateCreated'));
      onDone();
    } catch {
      toast.error(t('barcodes.templateCreateError'));
    } finally {
      setSaving(false);
    }
  }, [name, category, symbology, format, t, onDone]);

  return (
    <div className="space-y-4">
      <Input label={t('barcodes.name')} placeholder={t('barcodes.templateNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} error={nameError} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t('barcodes.category')}</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="patient">{t('barcodes.patient')}</option>
            <option value="pharmacy">{t('barcodes.prescription')}</option>
            <option value="laboratory">{t('barcodes.labOrder')}</option>
            <option value="asset">{t('barcodes.asset')}</option>
            <option value="custom">{t('barcodes.custom')}</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('barcodes.symbology')}</label>
          <select className="input" value={symbology} onChange={(e) => setSymbology(e.target.value)}>
            <option value="code128">Code 128</option>
            <option value="qr">QR Code</option>
            <option value="datamatrix">Data Matrix</option>
            <option value="ean13">EAN-13</option>
            <option value="upca">UPC-A</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('barcodes.format')}</label>
          <select className="input" value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="png">PNG</option>
            <option value="svg">SVG</option>
            <option value="pdf">PDF</option>
          </select>
        </div>
      </div>
      <Button className="w-full" onClick={handleSubmit} loading={saving} disabled={saving}>
        {saving ? t('automation.creating') : t('automation.createRule')}
      </Button>
    </div>
  );
}

function GenerateForm({ templates, onDone }: { templates: BarcodeTemplate[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [templateCode, setTemplateCode] = useState(templates[0]?.code ?? '');
  const [referenceType, setReferenceType] = useState('patient');
  const [referenceId, setReferenceId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!templateCode) {
      toast.error(t('barcodes.selectTemplate'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/barcodes/generate', {
        templateCode,
        referenceType: referenceType || undefined,
        referenceId: referenceId || undefined,
      });
      toast.success(t('barcodes.barcodeGenerated'));
      onDone();
    } catch {
      toast.error(t('barcodes.barcodeGenerateError'));
    } finally {
      setSaving(false);
    }
  }, [templateCode, referenceType, referenceId, t, onDone]);

  const templateOptions = templates.map((tpl) => ({ value: tpl.code, label: `${tpl.name} (${tpl.code})` }));

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">{t('barcodes.template')}</label>
        <select className="input" value={templateCode} onChange={(e) => setTemplateCode(e.target.value)}>
          {templateOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{sanitizeString(opt.label)}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t('barcodes.referenceType')}</label>
          <select className="input" value={referenceType} onChange={(e) => setReferenceType(e.target.value)}>
            <option value="patient">{t('barcodes.patient')}</option>
            <option value="prescription">{t('barcodes.prescription')}</option>
            <option value="lab_order">{t('barcodes.labOrder')}</option>
            <option value="asset">{t('barcodes.asset')}</option>
            <option value="custom">{t('barcodes.custom')}</option>
          </select>
        </div>
        <Input label={t('barcodes.referenceId')} placeholder={t('barcodes.referenceIdPlaceholder')} value={referenceId} onChange={(e) => setReferenceId(e.target.value)} />
      </div>
      <Button className="w-full" onClick={handleSubmit} loading={saving} disabled={saving}>
        {saving ? t('automation.creating') : t('barcodes.generate')}
      </Button>
    </div>
  );
}

function ScanForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [barcodeData, setBarcodeData] = useState('');
  const [action, setAction] = useState('scan');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [barcodeError, setBarcodeError] = useState('');

  const handleSubmit = useCallback(async () => {
    if (!barcodeData.trim()) {
      setBarcodeError(t('barcodes.barcodeData') + ' is required');
      return;
    }
    setBarcodeError('');
    setSaving(true);
    try {
      await api.post('/barcodes/scan', {
        barcodeData: sanitizeString(barcodeData),
        action,
        location: location ? sanitizeString(location) : undefined,
      });
      toast.success(t('barcodes.scanLogged'));
      onDone();
    } catch {
      toast.error(t('barcodes.scanLogError'));
    } finally {
      setSaving(false);
    }
  }, [barcodeData, action, location, t, onDone]);

  return (
    <div className="space-y-4">
      <Input
        label={t('barcodes.barcodeData')}
        placeholder={t('barcodes.scanDataPlaceholder')}
        value={barcodeData}
        onChange={(e) => { setBarcodeData(e.target.value); setBarcodeError(''); }}
        error={barcodeError}
        autoFocus
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t('barcodes.actionType')}</label>
          <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="scan">{t('barcodes.scanAction')}</option>
            <option value="verify">{t('barcodes.verify')}</option>
            <option value="check_in">{t('barcodes.checkIn')}</option>
            <option value="dispense">{t('barcodes.dispense')}</option>
          </select>
        </div>
        <Input label={t('barcodes.location')} placeholder={t('barcodes.locationPlaceholder')} value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <Button className="w-full" onClick={handleSubmit} loading={saving} disabled={saving}>
        {saving ? t('automation.creating') : t('barcodes.logScan')}
      </Button>
    </div>
  );
}
