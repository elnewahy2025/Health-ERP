import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  PillBottle, AlertTriangle, Search, Package, TrendingDown,
  CheckCircle, Plus,
} from 'lucide-react';
import {
  Card, CardBody, Button, Input, Badge, Table,
  PageLoader, EmptyState, Modal,
  type Column,
} from '../components/ui';
import { Can } from '../components/auth/Authorization';
import { apiClient as api } from '../lib/api';
import { sanitizeString, escapeHtml } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';

/* ── Types ─────────────────────────────────────────────────────────── */

type PharmTab = 'interactions' | 'inventory' | 'prescriptions' | 'alerts';

interface DrugInfo {
  name: string;
  category: string;
  form: string;
  priceEgp: number;
}

interface Interaction {
  drug1: string;
  drug2: string;
  severity: 'critical' | 'major' | 'moderate';
  description: string;
}

interface InventoryItem {
  id: string;
  drugName: string;
  genericName: string;
  brandName: string;
  dosageForm: string;
  strength: string;
  stockQuantity: number;
  reorderLevel: number;
  unitPrice: number;
  batchNumber: string;
  expiryDate: string;
  manufacturer: string;
  requiresPrescription: boolean;
  status: string;
}

interface Prescription {
  id: string;
  prescriptionNumber: string;
  patientId: string;
  patientName: string;
  status: string;
  notes: string;
  items: PrescriptionItem[];
  createdAt: string;
}

interface PrescriptionItem {
  id: string;
  drugName: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: number;
  quantityDispensed: number;
  refills: number;
  instructions: string;
  status: string;
}

/* ── Drug Interaction Database (Egypt market) ─────────────────────── */

const DRUG_INTERACTIONS: Record<string, string[]> = {
  Warfarin: ['Aspirin', 'Ibuprofen', 'Diclofenac', 'Naproxen'],
  Metformin: ['Alcohol', 'Contrast Dye'],
  Lisinopril: ['Potassium Supplements', 'NSAIDs', 'Ibuprofen'],
  Amlodipine: ['Simvastatin', 'Grapefruit'],
  Atorvastatin: ['Clarithromycin', 'Itraconazole', 'Grapefruit'],
  Omeprazole: ['Clopidogrel', 'Methotrexate'],
  Aspirin: ['Warfarin', 'Ibuprofen', 'Methotrexate'],
  Ibuprofen: ['Warfarin', 'Lithium', 'Methotrexate', 'Lisinopril'],
  Metoprolol: ['Verapamil', 'Digoxin'],
  Ciprofloxacin: ['Antacids', 'Iron Supplements', 'Dairy Products'],
  Azithromycin: ['Warfarin', 'Digoxin'],
  Diclofenac: ['Warfarin', 'Lithium', 'Methotrexate'],
  Clopidogrel: ['Omeprazole', 'Esomeprazole'],
};

const COMMON_DRUGS: DrugInfo[] = [
  { name: 'Amoxicillin', category: 'Antibiotic', form: 'Capsule 500mg', priceEgp: 45 },
  { name: 'Azithromycin', category: 'Antibiotic', form: 'Tablet 250mg', priceEgp: 85 },
  { name: 'Ciprofloxacin', category: 'Antibiotic', form: 'Tablet 500mg', priceEgp: 65 },
  { name: 'Metformin', category: 'Antidiabetic', form: 'Tablet 500mg', priceEgp: 25 },
  { name: 'Gliclazide', category: 'Antidiabetic', form: 'Tablet 80mg', priceEgp: 35 },
  { name: 'Amlodipine', category: 'Antihypertensive', form: 'Tablet 5mg', priceEgp: 30 },
  { name: 'Lisinopril', category: 'Antihypertensive', form: 'Tablet 10mg', priceEgp: 40 },
  { name: 'Atorvastatin', category: 'Statin', form: 'Tablet 20mg', priceEgp: 55 },
  { name: 'Omeprazole', category: 'PPI', form: 'Capsule 20mg', priceEgp: 35 },
  { name: 'Pantoprazole', category: 'PPI', form: 'Tablet 40mg', priceEgp: 45 },
  { name: 'Ibuprofen', category: 'NSAID', form: 'Tablet 400mg', priceEgp: 15 },
  { name: 'Diclofenac', category: 'NSAID', form: 'Tablet 50mg', priceEgp: 20 },
  { name: 'Aspirin', category: 'Antiplatelet', form: 'Tablet 81mg', priceEgp: 12 },
  { name: 'Clopidogrel', category: 'Antiplatelet', form: 'Tablet 75mg', priceEgp: 95 },
  { name: 'Warfarin', category: 'Anticoagulant', form: 'Tablet 5mg', priceEgp: 30 },
  { name: 'Levothyroxine', category: 'Thyroid', form: 'Tablet 50mcg', priceEgp: 25 },
  { name: 'Cetirizine', category: 'Antihistamine', form: 'Tablet 10mg', priceEgp: 18 },
  { name: 'Salbutamol', category: 'Bronchodilator', form: 'Inhaler', priceEgp: 65 },
  { name: 'Prednisolone', category: 'Corticosteroid', form: 'Tablet 5mg', priceEgp: 15 },
];

/* ── Helpers ───────────────────────────────────────────────────────── */

function getStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'gray' {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'gray'> = {
    dispensed: 'success',
    active: 'info',
    pending: 'warning',
    expired: 'danger',
    low_stock: 'danger',
  };
  return map[status] ?? 'gray';
}

function getSeverityVariant(severity: string): 'danger' | 'warning' | 'info' {
  const map: Record<string, 'danger' | 'warning' | 'info'> = {
    critical: 'danger',
    major: 'warning',
    moderate: 'info',
  };
  return map[severity] ?? 'info';
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function PharmacyAdvancedPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PharmTab>('interactions');
  const [loading, setLoading] = useState(true);

  /* ── Interaction state ── */
  const [selectedDrugs, setSelectedDrugs] = useState<string[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [searchDrug, setSearchDrug] = useState('');

  /* ── Inventory state ── */
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  /* ── Prescriptions state ── */
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);

  /* ── Add drug modal ── */
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    drugName: '', genericName: '', brandName: '', dosageForm: '',
    strength: '', stockQuantity: '0', reorderLevel: '10', unitPrice: '0',
    batchNumber: '', expiryDate: '', manufacturer: '',
  });
  const [addLoading, setAddLoading] = useState(false);

  /* ── Filtering ── */

  const filteredDrugs = COMMON_DRUGS.filter((d) =>
    d.name.toLowerCase().includes(searchDrug.toLowerCase())
  );

  const lowStockItems = inventory.filter((item) => item.stockQuantity <= item.reorderLevel);

  /* ── Data fetching ── */

  const fetchInventory = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/pharmacy/inventory');
      setInventory((data.data ?? []) as InventoryItem[]);
    } catch {
      toast.error(t('pharmAdv.loadInventoryFailed'));
    }
  }, [t]);

  const fetchPrescriptions = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/pharmacy/prescriptions');
      setPrescriptions((data.data ?? []) as Prescription[]);
    } catch {
      toast.error(t('pharmAdv.loadPrescriptionsFailed'));
    }
  }, [t]);

  /* ── Initial load ── */

  useEffect(() => {
    let cancelled = false;
    const loadAll = async (): Promise<void> => {
      setLoading(true);
      await Promise.allSettled([fetchInventory(), fetchPrescriptions()]);
      if (!cancelled) setLoading(false);
    };
    void loadAll();
    return () => { cancelled = true; };
  }, [fetchInventory, fetchPrescriptions]);

  /* ── Drug interaction check ── */

  const checkInteractions = useCallback((): void => {
    const found: Interaction[] = [];
    for (let i = 0; i < selectedDrugs.length; i++) {
      for (let j = i + 1; j < selectedDrugs.length; j++) {
        const d1 = selectedDrugs[i];
        const d2 = selectedDrugs[j];
        const interacts1 = DRUG_INTERACTIONS[d1]?.includes(d2);
        const interacts2 = DRUG_INTERACTIONS[d2]?.includes(d1);
        if (interacts1 || interacts2) {
          found.push({
            drug1: d1,
            drug2: d2,
            severity: 'major',
            description: `${d1} and ${d2} have a known interaction. Consult physician before combining.`,
          });
        }
      }
    }
    const categories = selectedDrugs.map((d) => COMMON_DRUGS.find((dd) => dd.name === d)?.category);
    if (categories.includes('NSAID') && categories.includes('Anticoagulant')) {
      found.push({
        drug1: 'NSAID',
        drug2: 'Anticoagulant',
        severity: 'critical',
        description: 'NSAIDs increase bleeding risk when combined with anticoagulants!',
      });
    }
    if (categories.filter((c) => c === 'Antihypertensive').length > 1) {
      found.push({
        drug1: 'Antihypertensive',
        drug2: 'Antihypertensive',
        severity: 'moderate',
        description: 'Multiple antihypertensives may cause hypotension. Monitor blood pressure.',
      });
    }
    setInteractions(found);
  }, [selectedDrugs]);

  const toggleDrug = useCallback((name: string): void => {
    setSelectedDrugs((prev) =>
      prev.includes(name) ? prev.filter((d) => d !== name) : [...prev, name]
    );
  }, []);

  /* ── Add drug handler ── */

  const handleAddDrug = useCallback(async (): Promise<void> => {
    if (!addForm.drugName.trim()) {
      toast.error(t('pharmAdv.drugName') + ' is required');
      return;
    }
    setAddLoading(true);
    try {
      await api.post('/pharmacy/inventory', {
        drugName: sanitizeString(addForm.drugName),
        genericName: sanitizeString(addForm.genericName),
        brandName: sanitizeString(addForm.brandName),
        dosageForm: sanitizeString(addForm.dosageForm),
        strength: sanitizeString(addForm.strength),
        stockQuantity: Number(addForm.stockQuantity) || 0,
        reorderLevel: Number(addForm.reorderLevel) || 10,
        unitPrice: Number(addForm.unitPrice) || 0,
        batchNumber: sanitizeString(addForm.batchNumber),
        expiryDate: addForm.expiryDate || null,
        manufacturer: sanitizeString(addForm.manufacturer),
      });
      toast.success(t('pharmAdv.addDrugSuccess'));
      setShowAddModal(false);
      setAddForm({
        drugName: '', genericName: '', brandName: '', dosageForm: '',
        strength: '', stockQuantity: '0', reorderLevel: '10', unitPrice: '0',
        batchNumber: '', expiryDate: '', manufacturer: '',
      });
      void fetchInventory();
    } catch {
      toast.error(t('pharmAdv.addDrugFailed'));
    } finally {
      setAddLoading(false);
    }
  }, [addForm, t, fetchInventory]);

  /* ── Table columns ── */

  const inventoryColumns: Column<InventoryItem>[] = [
    {
      key: 'drugName',
      header: t('pharmAdv.medication'),
      render: (item) => (
        <div>
          <p className="font-medium">{escapeHtml(item.drugName)}</p>
          <p className="text-xs text-gray-500">{escapeHtml(item.dosageForm)} {escapeHtml(item.strength)}</p>
        </div>
      ),
    },
    {
      key: 'stockQuantity',
      header: t('pharmAdv.quantity'),
      render: (item) => <span>{item.stockQuantity}</span>,
    },
    {
      key: 'unitPrice',
      header: t('pharmAdv.price'),
      render: (item) => <span>{item.unitPrice?.toLocaleString('ar-EG')} EGP</span>,
    },
    {
      key: 'status',
      header: t('pharmAdv.status'),
      render: (item) => {
        const stockStatus = item.stockQuantity <= 0 ? 'danger' : item.stockQuantity <= item.reorderLevel ? 'warning' : 'success';
        const label = item.stockQuantity <= 0 ? t('pharmAdv.outOfStock') : item.stockQuantity <= item.reorderLevel ? t('pharmAdv.lowStock') : t('pharmAdv.inStock');
        return <Badge variant={stockStatus}>{label}</Badge>;
      },
    },
  ];

  const prescriptionColumns: Column<Prescription>[] = [
    {
      key: 'prescriptionNumber',
      header: t('pharmAdv.prescriptionNumber'),
      render: (item) => <span className="font-medium">{escapeHtml(item.prescriptionNumber)}</span>,
    },
    {
      key: 'patientName',
      header: t('pharmAdv.patient'),
      render: (item) => <span>{escapeHtml(item.patientName)}</span>,
    },
    {
      key: 'status',
      header: t('pharmAdv.status'),
      render: (item) => <Badge variant={getStatusVariant(item.status)}>{item.status}</Badge>,
    },
    {
      key: 'createdAt',
      header: t('pharmAdv.prescribedDate'),
      render: (item) => <span>{formatDateTime(item.createdAt) || '-'}</span>,
    },
  ];

  /* ── Tabs ── */

  const tabs: Array<{ key: PharmTab; icon: React.ReactNode; label: string }> = [
    { key: 'interactions', icon: <AlertTriangle className="w-4 h-4" />, label: t('pharmAdv.interactionsTab') },
    { key: 'inventory', icon: <Package className="w-4 h-4" />, label: t('pharmAdv.inventoryTab') },
    { key: 'prescriptions', icon: <PillBottle className="w-4 h-4" />, label: t('pharmAdv.prescriptionsTab') },
    { key: 'alerts', icon: <TrendingDown className="w-4 h-4" />, label: t('pharmAdv.alertsTab') },
  ];

  /* ── Render ── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <PillBottle className="w-6 h-6 text-primary-600" />
            {t('pharmAdv.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t('pharmAdv.subtitle')}</p>
        </div>
        {tab === 'inventory' && (
          <Can permission="pharmacy.create" scope="branch">
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4 mr-1" />
              {t('pharmAdv.addDrug')}
            </Button>
          </Can>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === tabItem.key
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tabItem.icon}
            {tabItem.label}
            {tabItem.key === 'alerts' && lowStockItems.length > 0 && (
              <Badge variant="danger">{lowStockItems.length}</Badge>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <PageLoader message={t('common.loading')} />
      ) : (
        <>
          {/* ── INTERACTIONS TAB ── */}
          {tab === 'interactions' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <Card>
                  <CardBody className="p-4">
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder={t('pharmAdv.searchDrug')}
                        value={searchDrug}
                        onChange={(e) => setSearchDrug(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div className="space-y-1 max-h-[400px] overflow-y-auto">
                      {filteredDrugs.map((drug) => (
                        <button
                          key={drug.name}
                          onClick={() => toggleDrug(drug.name)}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                            selectedDrugs.includes(drug.name)
                              ? 'bg-primary-50 border border-primary-300'
                              : 'hover:bg-gray-50 border border-transparent'
                          }`}
                        >
                          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                            <PillBottle className="w-4 h-4 text-primary-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{escapeHtml(drug.name)}</p>
                            <p className="text-xs text-gray-500">{escapeHtml(drug.category)} — {escapeHtml(drug.form)}</p>
                          </div>
                          {selectedDrugs.includes(drug.name) && (
                            <CheckCircle className="w-4 h-4 text-primary-600 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                    {selectedDrugs.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-sm text-gray-500 mb-2">
                          {t('pharmAdv.selected', { count: String(selectedDrugs.length) } as Record<string, unknown>)}
                        </p>
                        <Button onClick={checkInteractions} className="w-full">
                          {t('pharmAdv.checkInteractions')}
                        </Button>
                      </div>
                    )}
                  </CardBody>
                </Card>
              </div>

              <div className="lg:col-span-2">
                <Card>
                  <CardBody className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-4">{t('pharmAdv.interactionResults')}</h3>
                    {interactions.length === 0 ? (
                      <EmptyState
                        icon={<CheckCircle className="w-8 h-8 text-green-400" />}
                        title={selectedDrugs.length > 0 ? t('pharmAdv.noInteractions') : t('pharmAdv.selectToCheck')}
                      />
                    ) : (
                      <div className="space-y-3">
                        {interactions.map((inter, idx) => (
                          <div
                            key={idx}
                            className={`p-4 rounded-lg border-l-4 ${
                              inter.severity === 'critical'
                                ? 'bg-red-50 border-red-500'
                                : inter.severity === 'major'
                                  ? 'bg-orange-50 border-orange-500'
                                  : 'bg-yellow-50 border-yellow-500'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <AlertTriangle
                                className={`w-5 h-5 mt-0.5 ${
                                  inter.severity === 'critical'
                                    ? 'text-red-500'
                                    : inter.severity === 'major'
                                      ? 'text-orange-500'
                                      : 'text-yellow-500'
                                }`}
                              />
                              <div>
                                <p className="font-medium text-gray-900">
                                  {escapeHtml(inter.drug1)} ↔ {escapeHtml(inter.drug2)}
                                </p>
                                <Badge variant={getSeverityVariant(inter.severity)} className="mt-1">
                                  {t(`pharmAdv.${inter.severity}`)}
                                </Badge>
                                <p className="text-sm text-gray-600 mt-1">{escapeHtml(inter.description)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              </div>
            </div>
          )}

          {/* ── INVENTORY TAB ── */}
          {tab === 'inventory' && (
            <Card>
              <CardBody className="p-0">
                <Table<InventoryItem>
                  columns={inventoryColumns}
                  data={inventory}
                  loading={false}
                  emptyMessage={t('pharmAdv.allAdequatelyStocked')}
                />
              </CardBody>
            </Card>
          )}

          {/* ── PRESCRIPTIONS TAB ── */}
          {tab === 'prescriptions' && (
            <Card>
              <CardBody className="p-0">
                <Table<Prescription>
                  columns={prescriptionColumns}
                  data={prescriptions}
                  loading={false}
                  emptyMessage={t('pharmAdv.noPrescriptions')}
                />
              </CardBody>
            </Card>
          )}

          {/* ── ALERTS TAB ── */}
          {tab === 'alerts' && (
            <Card>
              <CardBody className="p-4">
                {lowStockItems.length === 0 ? (
                  <EmptyState
                    icon={<Package className="w-8 h-8 text-green-400" />}
                    title={t('pharmAdv.allAdequatelyStocked')}
                  />
                ) : (
                  <div className="space-y-3">
                    {lowStockItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-4 p-4 bg-red-50 rounded-lg border border-red-200">
                        <TrendingDown className="w-5 h-5 text-red-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900">{escapeHtml(item.drugName)}</p>
                          <p className="text-sm text-red-600">
                            {t('pharmAdv.unitsRemaining', {
                              count: String(item.stockQuantity),
                              level: String(item.reorderLevel),
                            } as Record<string, unknown>)}
                          </p>
                        </div>
                        <Can permission="pharmacy.edit" scope="branch">
                          <Button size="sm" variant="secondary">
                            {t('pharmAdv.reorder')}
                          </Button>
                        </Can>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </>
      )}

      {/* ── Add Drug Modal ── */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={t('pharmAdv.addDrug')}
        size="lg"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              {t('common.cancel')}
            </Button>
            <Can permission="pharmacy.create" scope="branch">
              <Button onClick={() => void handleAddDrug()} loading={addLoading} disabled={addLoading}>
                {t('common.save')}
              </Button>
            </Can>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('pharmAdv.drugName')}
            value={addForm.drugName}
            onChange={(e) => setAddForm((prev) => ({ ...prev, drugName: e.target.value }))}
            required
          />
          <Input
            label={t('pharmAdv.genericName')}
            value={addForm.genericName}
            onChange={(e) => setAddForm((prev) => ({ ...prev, genericName: e.target.value }))}
          />
          <Input
            label={t('pharmAdv.brandName')}
            value={addForm.brandName}
            onChange={(e) => setAddForm((prev) => ({ ...prev, brandName: e.target.value }))}
          />
          <Input
            label={t('pharmAdv.dosageForm')}
            value={addForm.dosageForm}
            onChange={(e) => setAddForm((prev) => ({ ...prev, dosageForm: e.target.value }))}
          />
          <Input
            label={t('pharmAdv.strength')}
            value={addForm.strength}
            onChange={(e) => setAddForm((prev) => ({ ...prev, strength: e.target.value }))}
          />
          <Input
            label={t('pharmAdv.stockQuantity')}
            type="number"
            min="0"
            value={addForm.stockQuantity}
            onChange={(e) => setAddForm((prev) => ({ ...prev, stockQuantity: e.target.value }))}
          />
          <Input
            label={t('pharmAdv.reorderLevel')}
            type="number"
            min="0"
            value={addForm.reorderLevel}
            onChange={(e) => setAddForm((prev) => ({ ...prev, reorderLevel: e.target.value }))}
          />
          <Input
            label={t('pharmAdv.unitPrice')}
            type="number"
            min="0"
            step="0.01"
            value={addForm.unitPrice}
            onChange={(e) => setAddForm((prev) => ({ ...prev, unitPrice: e.target.value }))}
          />
          <Input
            label={t('pharmAdv.batchNumber')}
            value={addForm.batchNumber}
            onChange={(e) => setAddForm((prev) => ({ ...prev, batchNumber: e.target.value }))}
          />
          <Input
            label={t('pharmAdv.expiryDate')}
            type="date"
            value={addForm.expiryDate}
            onChange={(e) => setAddForm((prev) => ({ ...prev, expiryDate: e.target.value }))}
          />
          <Input
            label={t('pharmAdv.manufacturer')}
            value={addForm.manufacturer}
            onChange={(e) => setAddForm((prev) => ({ ...prev, manufacturer: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}
