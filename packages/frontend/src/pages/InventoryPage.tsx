import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { inventoryApi, type InventoryItem, type Warehouse, type PurchaseOrder } from '../lib/api';
import { Modal, Input, Select, Button, Badge, EmptyState, PageLoader } from '../components/ui';
import { Plus, Package, Warehouse as WarehouseIcon } from 'lucide-react';
import { sanitizeNumber, sanitizeString } from '../lib/sanitize';
import toast from 'react-hot-toast';
import { Can } from '../components/auth/Authorization';
import { useClinicMoney } from '../stores/clinicConfigurationStore';

type TabType = 'items' | 'warehouses' | 'pos';

interface ItemForm {
  warehouseId: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  reorderPoint: number;
  unitCost: number;
  unitPrice: number;
  batchNumber: string;
  expiryDate: string;
  serialNumber: string;
  manufacturer: string;
  supplier: string;
  description: string;
}

interface WarehouseForm {
  name: string;
  code: string;
  type: string;
}

interface PoForm {
  warehouseId: string;
  supplier: string;
  orderDate: string;
  expectedDate: string;
  notes: string;
}

interface ItemFormErrors {
  name?: string;
  sku?: string;
  warehouseId?: string;
  unitPrice?: string;
}

interface WarehouseFormErrors {
  name?: string;
  code?: string;
}

interface PoFormErrors {
  supplier?: string;
  items?: string;
}

const UNITS = ['piece', 'box', 'bottle', 'strip', 'carton'] as const;
const WAREHOUSE_TYPES = ['main', 'branch', 'storage'] as const;
const INITIAL_ITEM_FORM: ItemForm = {
  warehouseId: '', sku: '', name: '', category: '', unit: 'piece',
  quantity: 0, reorderPoint: 10, unitCost: 0, unitPrice: 0,
  batchNumber: '', expiryDate: '', serialNumber: '',
  manufacturer: '', supplier: '', description: '',
};

const INITIAL_WAREHOUSE_FORM: WarehouseForm = { name: '', code: '', type: 'main' };
const INITIAL_PO_FORM: PoForm = { warehouseId: '', supplier: '', orderDate: '', expectedDate: '', notes: '' };

interface PoLineItem {
  itemId?: string;
  itemName: string;
  sku?: string;
  quantityOrdered: number;
  unitCost: number;
}

const EMPTY_PO_LINE: PoLineItem = { itemId: '', itemName: '', sku: '', quantityOrdered: 1, unitCost: 0 };

function validateItemForm(form: ItemForm, t: (key: string) => string): ItemFormErrors {
  const errors: ItemFormErrors = {};
  if (!form.name.trim()) errors.name = t('inventory.nameRequired');
  if (!form.sku.trim()) errors.sku = t('inventory.skuRequired');
  if (!form.warehouseId) errors.warehouseId = t('inventory.warehouseRequired');
  if (form.unitPrice < 0) errors.unitPrice = t('inventory.pricePositive');
  return errors;
}

function validateWarehouseForm(form: WarehouseForm, t: (key: string) => string): WarehouseFormErrors {
  const errors: WarehouseFormErrors = {};
  if (!form.name.trim()) errors.name = t('inventory.nameRequired');
  if (!form.code.trim()) errors.code = t('inventory.skuRequired');
  return errors;
}

function validatePoForm(form: PoForm, items: PoLineItem[], t: (key: string) => string): PoFormErrors {
  const errors: PoFormErrors = {};
  if (!form.supplier.trim()) errors.supplier = t('inventory.nameRequired');
  if (items.length === 0) errors.items = t('inventory.poAtLeastOneItem');
  return errors;
}

function getStockColor(quantity: number, reorderPoint: number): string {
  if (quantity <= 0) return 'text-red-600';
  if (quantity <= reorderPoint) return 'text-yellow-600';
  return 'text-green-600';
}

export default function InventoryPage() {
  const { t } = useTranslation();
  const formatMoney = useClinicMoney();

  const [tab, setTab] = useState<TabType>('items');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showItemModal, setShowItemModal] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [showPoModal, setShowPoModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [itemForm, setItemForm] = useState<ItemForm>(INITIAL_ITEM_FORM);
  const [itemErrors, setItemErrors] = useState<ItemFormErrors>({});
  const [warehouseForm, setWarehouseForm] = useState<WarehouseForm>(INITIAL_WAREHOUSE_FORM);
  const [warehouseErrors, setWarehouseErrors] = useState<WarehouseFormErrors>({});
  const [poForm, setPoForm] = useState<PoForm>(INITIAL_PO_FORM);
  const [poErrors, setPoErrors] = useState<PoFormErrors>({});
  const [poItems, setPoItems] = useState<PoLineItem[]>([]);
  const [poDraft, setPoDraft] = useState<PoLineItem>({ ...EMPTY_PO_LINE });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [itemData, whData, poData] = await Promise.allSettled([
          inventoryApi.listItems(),
          inventoryApi.listWarehouses(),
          inventoryApi.listPos(),
        ]);
        if (!cancelled) {
          if (itemData.status === 'fulfilled') setItems(itemData.value);
          if (whData.status === 'fulfilled') setWarehouses(whData.value);
          if (poData.status === 'fulfilled') setPos(poData.value);
          if (itemData.status === 'rejected' && whData.status === 'rejected') {
            toast.error(t('inventory.loadFailed'));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [t]);

  const filteredItems = items.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q) || item.category?.toLowerCase().includes(q);
  });

  const filteredPos = pos.filter((po) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return po.poNumber.toLowerCase().includes(q) || po.supplier.toLowerCase().includes(q);
  });

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateItemForm(itemForm, t);
    setItemErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await inventoryApi.createItem({
        warehouseId: itemForm.warehouseId,
        sku: sanitizeString(itemForm.sku),
        name: sanitizeString(itemForm.name),
        category: sanitizeString(itemForm.category),
        unit: itemForm.unit,
        quantity: itemForm.quantity,
        reorderPoint: itemForm.reorderPoint,
        unitCost: itemForm.unitCost,
        unitPrice: itemForm.unitPrice,
        batchNumber: itemForm.batchNumber || undefined,
        expiryDate: itemForm.expiryDate || undefined,
        serialNumber: itemForm.serialNumber || undefined,
        manufacturer: itemForm.manufacturer || undefined,
        supplier: itemForm.supplier || undefined,
        description: itemForm.description || undefined,
      });
      toast.success(t('inventory.createItemSuccess'));
      closeItemModal();
      const data = await inventoryApi.listItems();
      setItems(data);
    } catch {
      toast.error(t('inventory.createItemFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateWarehouseForm(warehouseForm, t);
    setWarehouseErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await inventoryApi.createWarehouse({
        name: sanitizeString(warehouseForm.name),
        code: sanitizeString(warehouseForm.code),
        type: warehouseForm.type,
      });
      toast.success(t('inventory.createWarehouseSuccess'));
      closeWarehouseModal();
      const data = await inventoryApi.listWarehouses();
      setWarehouses(data);
    } catch {
      toast.error(t('inventory.createWarehouseFailed'));
    } finally {
      setSaving(false);
    }
  };

  const addPoLine = useCallback(() => {
    const name = poDraft.itemName.trim();
    if (!name || poDraft.quantityOrdered <= 0) return;
    setPoItems((prev) => [...prev, { ...poDraft, itemName: sanitizeString(name), sku: poDraft.sku?.trim() || undefined }]);
    setPoDraft({ ...EMPTY_PO_LINE });
    setPoErrors((p) => ({ ...p, items: undefined }));
  }, [poDraft]);

  const removePoLine = useCallback((index: number) => {
    setPoItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validatePoForm(poForm, poItems, t);
    setPoErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await inventoryApi.createPo({
        warehouseId: poForm.warehouseId || undefined,
        supplier: sanitizeString(poForm.supplier),
        orderDate: poForm.orderDate || undefined,
        expectedDate: poForm.expectedDate || undefined,
        notes: poForm.notes || undefined,
        items: poItems.map((i) => ({
          itemId: i.itemId || undefined,
          itemName: i.itemName,
          sku: i.sku || undefined,
          quantityOrdered: i.quantityOrdered,
          unitCost: i.unitCost,
        })),
      });
      toast.success(t('inventory.createPoSuccess'));
      closePoModal();
      setPoItems([]);
      setPoDraft({ ...EMPTY_PO_LINE });
      const data = await inventoryApi.listPos();
      setPos(data);
    } catch {
      toast.error(t('inventory.createPoFailed'));
    } finally {
      setSaving(false);
    }
  };

  const closeItemModal = () => {
    setShowItemModal(false);
    setItemForm(INITIAL_ITEM_FORM);
    setItemErrors({});
  };

  const closeWarehouseModal = () => {
    setShowWarehouseModal(false);
    setWarehouseForm(INITIAL_WAREHOUSE_FORM);
    setWarehouseErrors({});
  };

  const closePoModal = () => {
    setShowPoModal(false);
    setPoForm(INITIAL_PO_FORM);
    setPoErrors({});
  };

  const openNewModal = () => {
    if (tab === 'items') setShowItemModal(true);
    else if (tab === 'warehouses') setShowWarehouseModal(true);
    else setShowPoModal(true);
  };

  const unitOptions = UNITS.map((u) => ({ value: u, label: t(`inventory.${u}`) }));
  const warehouseTypeOptions = WAREHOUSE_TYPES.map((wt) => ({ value: wt, label: t(`inventory.${wt}`) }));
  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }));

  const newItemLabel = t('inventory.newItem');
  const newWhLabel = t('inventory.newWarehouse');
  const newPoLabel = t('inventory.newPo');

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('inventory.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('inventory.itemsCount', { count: items.length })}, {pos.length} {t('inventory.purchaseOrders').toLowerCase()}
          </p>
        </div>
        <Can permission={tab === 'items' ? 'inventory.create' : tab === 'warehouses' ? 'inventory.create' : 'inventory.create'}>
          <Button icon={<Plus className="w-4 h-4" />} onClick={openNewModal}>
            {tab === 'items' ? newItemLabel : tab === 'warehouses' ? newWhLabel : newPoLabel}
          </Button>
        </Can>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button
          variant={tab === 'items' ? 'primary' : 'secondary'}
          onClick={() => { setTab('items'); setSearch(''); }}
          icon={<Package className="w-4 h-4" />}
        >
          {t('inventory.items')} ({items.length})
        </Button>
        <Button
          variant={tab === 'warehouses' ? 'primary' : 'secondary'}
          onClick={() => { setTab('warehouses'); setSearch(''); }}
          icon={<WarehouseIcon className="w-4 h-4" />}
        >
          {t('inventory.warehouses')} ({warehouses.length})
        </Button>
        <Button
          variant={tab === 'pos' ? 'primary' : 'secondary'}
          onClick={() => { setTab('pos'); setSearch(''); }}
        >
          {t('inventory.purchaseOrders')} ({pos.length})
        </Button>
      </div>

      {/* Search */}
      <div className="mb-4 max-w-md">
        <Input
          placeholder={t('inventory.searchPlaceholder', {
            type: tab === 'items' ? t('inventory.items') : tab === 'warehouses' ? t('inventory.warehouses') : t('inventory.purchaseOrders'),
          })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Items Tab */}
      {tab === 'items' && (
        filteredItems.length === 0 ? (
          <EmptyState title={t('inventory.noItems')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('inventory.sku')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('inventory.name')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('inventory.category')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('inventory.quantity')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('inventory.reorderPoint')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('inventory.unitPrice')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">{item.sku}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge>{item.category}</Badge></td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${getStockColor(item.quantity, item.reorderPoint)}`}>
                          {item.quantity} {t(`inventory.${item.unit}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.reorderPoint}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{formatMoney(item.unitPrice)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge>{item.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Warehouses Tab */}
      {tab === 'warehouses' && (
        filteredItems.length === 0 && warehouses.length === 0 ? (
          <EmptyState title={t('inventory.noWarehouses')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('inventory.name')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('inventory.sku')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('inventory.category')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {warehouses.map((wh) => (
                    <tr key={wh.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{wh.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">{wh.code}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge>{t(`inventory.${wh.type}`)}</Badge></td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge variant="success">{t('inventory.inStock')}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Purchase Orders Tab */}
      {tab === 'pos' && (
        filteredPos.length === 0 ? (
          <EmptyState title={t('inventory.noPos')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('inventory.poNumber')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('inventory.supplier')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('inventory.totalAmount')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('inventory.orderDate')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('inventory.items')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredPos.map((po) => (
                    <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">{po.poNumber}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{po.supplier}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{formatMoney(po.totalAmount)}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge>{po.status}</Badge></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{po.orderDate}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{po.items.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* New Item Modal */}
      <Modal open={showItemModal} onClose={closeItemModal} title={t('inventory.newItem')} size="lg"
        footer={<>
          <Button variant="secondary" onClick={closeItemModal}>{t('common.cancel')}</Button>
          <Can permission="inventory.create">
            <Button loading={saving} onClick={() => { const f = document.getElementById('item-form'); if (f) (f as HTMLFormElement).requestSubmit(); }}>{t('common.save')}</Button>
          </Can>
        </>}
      >
        <form id="item-form" onSubmit={handleCreateItem} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label={t('inventory.warehouse')} options={warehouseOptions} value={itemForm.warehouseId}
              onChange={(e) => { setItemForm((p) => ({ ...p, warehouseId: e.target.value })); setItemErrors((p) => ({ ...p, warehouseId: undefined })); }}
              error={itemErrors.warehouseId} placeholder={t('inventory.warehouseRequired')} />
            <Input label={t('inventory.sku')} value={itemForm.sku}
              onChange={(e) => { setItemForm((p) => ({ ...p, sku: e.target.value })); setItemErrors((p) => ({ ...p, sku: undefined })); }}
              error={itemErrors.sku} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('inventory.name')} value={itemForm.name}
              onChange={(e) => { setItemForm((p) => ({ ...p, name: e.target.value })); setItemErrors((p) => ({ ...p, name: undefined })); }}
              error={itemErrors.name} required />
            <Input label={t('inventory.category')} value={itemForm.category}
              onChange={(e) => setItemForm((p) => ({ ...p, category: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label={t('inventory.unit')} options={unitOptions} value={itemForm.unit}
              onChange={(e) => setItemForm((p) => ({ ...p, unit: e.target.value }))} />
            <Input type="number" label={t('inventory.quantity')} value={itemForm.quantity} min="0"
              onChange={(e) => setItemForm((p) => ({ ...p, quantity: sanitizeNumber(e.target.value) }))} />
            <Input type="number" label={t('inventory.reorderPoint')} value={itemForm.reorderPoint} min="0"
              onChange={(e) => setItemForm((p) => ({ ...p, reorderPoint: sanitizeNumber(e.target.value) }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input type="number" step="0.01" label={t('inventory.unitCost')} value={itemForm.unitCost} min="0"
              onChange={(e) => setItemForm((p) => ({ ...p, unitCost: sanitizeNumber(e.target.value) }))} />
            <Input type="number" step="0.01" label={t('inventory.unitPrice')} value={itemForm.unitPrice} min="0"
              onChange={(e) => { setItemForm((p) => ({ ...p, unitPrice: sanitizeNumber(e.target.value) })); setItemErrors((p) => ({ ...p, unitPrice: undefined })); }}
              error={itemErrors.unitPrice} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label={t('inventory.batchNumber')} value={itemForm.batchNumber}
              onChange={(e) => setItemForm((p) => ({ ...p, batchNumber: e.target.value }))} />
            <Input type="date" label={t('inventory.expiryDate')} value={itemForm.expiryDate}
              onChange={(e) => setItemForm((p) => ({ ...p, expiryDate: e.target.value }))} />
            <Input label={t('inventory.serialNumber')} value={itemForm.serialNumber}
              onChange={(e) => setItemForm((p) => ({ ...p, serialNumber: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('inventory.manufacturer')} value={itemForm.manufacturer}
              onChange={(e) => setItemForm((p) => ({ ...p, manufacturer: e.target.value }))} />
            <Input label={t('inventory.supplier')} value={itemForm.supplier}
              onChange={(e) => setItemForm((p) => ({ ...p, supplier: e.target.value }))} />
          </div>
          <Input label={t('inventory.description')} value={itemForm.description}
            onChange={(e) => setItemForm((p) => ({ ...p, description: e.target.value }))} />
        </form>
      </Modal>

      {/* New Warehouse Modal */}
      <Modal open={showWarehouseModal} onClose={closeWarehouseModal} title={t('inventory.newWarehouse')} size="md"
        footer={<>
          <Button variant="secondary" onClick={closeWarehouseModal}>{t('common.cancel')}</Button>
          <Can permission="inventory.create">
            <Button loading={saving} onClick={() => { const f = document.getElementById('warehouse-form'); if (f) (f as HTMLFormElement).requestSubmit(); }}>{t('common.save')}</Button>
          </Can>
        </>}
      >
        <form id="warehouse-form" onSubmit={handleCreateWarehouse} className="space-y-4">
          <Input label={t('inventory.name')} value={warehouseForm.name}
            onChange={(e) => { setWarehouseForm((p) => ({ ...p, name: e.target.value })); setWarehouseErrors((p) => ({ ...p, name: undefined })); }}
            error={warehouseErrors.name} required />
          <Input label={t('inventory.sku')} value={warehouseForm.code}
            onChange={(e) => { setWarehouseForm((p) => ({ ...p, code: e.target.value })); setWarehouseErrors((p) => ({ ...p, code: undefined })); }}
            error={warehouseErrors.code} required />
          <Select label={t('inventory.category')} options={warehouseTypeOptions} value={warehouseForm.type}
            onChange={(e) => setWarehouseForm((p) => ({ ...p, type: e.target.value }))} />
        </form>
      </Modal>

      {/* New PO Modal */}
      <Modal open={showPoModal} onClose={closePoModal} title={t('inventory.newPo')} size="md"
        footer={<>
          <Button variant="secondary" onClick={closePoModal}>{t('common.cancel')}</Button>
          <Can permission="inventory.create">
            <Button loading={saving} onClick={() => { const f = document.getElementById('po-form'); if (f) (f as HTMLFormElement).requestSubmit(); }}>{t('common.save')}</Button>
          </Can>
        </>}
      >
        <form id="po-form" onSubmit={handleCreatePo} className="space-y-4">
          <Select label={t('inventory.warehouse')} options={warehouseOptions} value={poForm.warehouseId}
            onChange={(e) => setPoForm((p) => ({ ...p, warehouseId: e.target.value }))}
            placeholder={t('inventory.warehouseRequired')} />
          <Input label={t('inventory.supplier')} value={poForm.supplier}
            onChange={(e) => { setPoForm((p) => ({ ...p, supplier: e.target.value })); setPoErrors((p) => ({ ...p, supplier: undefined })); }}
            error={poErrors.supplier} required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input type="date" label={t('inventory.orderDate')} value={poForm.orderDate}
              onChange={(e) => setPoForm((p) => ({ ...p, orderDate: e.target.value }))} />
            <Input type="date" label={t('inventory.expectedDate')} value={poForm.expectedDate}
              onChange={(e) => setPoForm((p) => ({ ...p, expectedDate: e.target.value }))} />
          </div>

          <div className="border border-gray-200 rounded-lg p-3 space-y-3">
            <p className="text-sm font-medium text-gray-700">{t('inventory.poItems')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <Select
                label={t('inventory.item')}
                options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.sku})` }))}
                value={poDraft.itemId || ''}
                onChange={(e) => {
                  const found = items.find((i) => i.id === e.target.value);
                  setPoDraft((p) => ({
                    ...p,
                    itemId: e.target.value,
                    itemName: found ? found.name : '',
                    sku: found ? found.sku : '',
                    unitCost: found ? Number(found.unitCost || 0) : 0,
                  }));
                }}
                placeholder={t('inventory.selectItem')}
              />
              <Input
                type="number"
                label={t('inventory.quantity')}
                min="1"
                value={poDraft.quantityOrdered}
                onChange={(e) => setPoDraft((p) => ({ ...p, quantityOrdered: Math.max(1, sanitizeNumber(e.target.value)) }))}
              />
              <Input
                type="number"
                step="0.01"
                label={t('inventory.unitCost')}
                min="0"
                value={poDraft.unitCost}
                onChange={(e) => setPoDraft((p) => ({ ...p, unitCost: sanitizeNumber(e.target.value) }))}
              />
              <div className="flex items-end">
                <Button type="button" variant="secondary" onClick={addPoLine} className="w-full">
                  {t('inventory.addLine')}
                </Button>
              </div>
            </div>

            {poItems.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {poItems.map((line, idx) => (
                  <li key={idx} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1">
                    <span className="font-medium">{sanitizeString(line.itemName)}</span>
                    <span className="text-gray-500">
                      {line.quantityOrdered} x {Number(line.unitCost).toFixed(2)} = {(line.quantityOrdered * line.unitCost).toFixed(2)}
                    </span>
                    <button type="button" onClick={() => removePoLine(idx)} className="text-red-500 hover:text-red-700 text-xs font-medium">
                      {t('common.remove')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400">{t('inventory.poNoItems')}</p>
            )}
            {poErrors.items && <p className="text-xs text-red-600">{poErrors.items}</p>}
          </div>

          <Input label={t('inventory.description')} value={poForm.notes}
            onChange={(e) => setPoForm((p) => ({ ...p, notes: e.target.value }))} />
        </form>
      </Modal>
    </div>
  );
}
