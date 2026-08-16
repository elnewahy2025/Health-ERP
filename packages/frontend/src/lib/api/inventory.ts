import { apiClient } from './client';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  quantity: number;
  reorderPoint: number;
  unitCost: number;
  unitPrice: number;
  batchNumber?: string;
  expiryDate?: string;
  serialNumber?: string;
  manufacturer?: string;
  supplier?: string;
  warehouseId: string;
  warehouseName?: string;
  barcode?: string;
  qrCode?: string;
  controlledSubstanceClass?: string;
  status: string;
  lastRestockedAt?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  type: string;
}

export interface Supplier {
  id: string;
  name: string;
  code: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  paymentTerms?: string;
  creditLimit: number;
  status: string;
}

export interface PurchaseOrderItem {
  id: string;
  itemName: string;
  sku?: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  totalCost: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplier: string;
  status: string;
  totalAmount: number;
  orderDate: string;
  expectedDate?: string;
  receivedDate?: string;
  notes?: string;
  items: PurchaseOrderItem[];
  createdAt: string;
}

export interface InventoryTransaction {
  id: string;
  itemId: string;
  itemName?: string;
  type: string;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCost: number;
  reasonCode?: string;
  referenceType?: string;
  referenceId?: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  notes?: string;
  createdAt: string;
}

export interface LowStockAlert {
  itemId: string;
  itemName: string;
  sku: string;
  currentQuantity: number;
  reorderPoint: number;
  warehouseName?: string;
  deficit: number;
}

export interface CreateItemPayload {
  warehouseId: string;
  sku: string;
  name: string;
  category?: string;
  unit?: string;
  quantity?: number;
  reorderPoint?: number;
  unitCost?: number;
  unitPrice?: number;
  batchNumber?: string;
  expiryDate?: string;
  serialNumber?: string;
  manufacturer?: string;
  supplierId?: string;
  supplier?: string;
  description?: string;
  barcode?: string;
  controlledSubstanceClass?: string;
}

export interface CreateWarehousePayload {
  name: string;
  code: string;
  type?: string;
}

export interface CreateSupplierPayload {
  name: string;
  code: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  paymentTerms?: string;
  creditLimit?: number;
  notes?: string;
}

export interface CreatePoPayload {
  warehouseId?: string;
  supplier: string;
  orderDate?: string;
  expectedDate?: string;
  notes?: string;
  items: { itemName: string; sku?: string; quantityOrdered: number; unitCost?: number }[];
}

export interface DispensePayload {
  itemId: string;
  quantity: number;
  patientId?: string;
  appointmentId?: string;
  notes?: string;
  useFefo?: boolean;
}

export interface TransferPayload {
  itemId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  notes?: string;
}

export interface AdjustmentPayload {
  itemId: string;
  quantityChange: number;
  reasonCode: string;
  notes?: string;
}

export const inventoryApi = {
  // Items
  listItems: (params?: { category?: string; warehouseId?: string; search?: string }) =>
    apiClient.get('/inventory/items', { params }).then((r) => r.data.data),
  getItem: (id: string) =>
    apiClient.get(`/inventory/items/${id}`).then((r) => r.data.data),
  getItemByBarcode: (barcode: string) =>
    apiClient.get(`/inventory/barcode/${barcode}`).then((r) => r.data.data),
  createItem: (data: CreateItemPayload) =>
    apiClient.post('/inventory/items', data).then((r) => r.data.data),
  updateStock: (id: string, data: { quantity: number; type?: string; notes?: string; reasonCode?: string }) =>
    apiClient.put(`/inventory/items/${id}/stock`, data).then((r) => r.data.data),

  // Dispensing
  dispense: (data: DispensePayload) =>
    apiClient.post('/inventory/dispense', data).then((r) => r.data.data),

  // Adjustments
  createAdjustment: (data: AdjustmentPayload) =>
    apiClient.post('/inventory/adjustments', data).then((r) => r.data.data),

  // Transfers
  transfer: (data: TransferPayload) =>
    apiClient.post('/inventory/transfers', data).then((r) => r.data.data),

  // Bulk receipt
  bulkReceipt: (data: { items: { itemId: string; quantity: number; unitCost?: number; batchNumber?: string; expiryDate?: string; notes?: string }[]; supplierId?: string }) =>
    apiClient.post('/inventory/bulk-receipt', data).then((r) => r.data.data),

  // Warehouses
  listWarehouses: () =>
    apiClient.get('/inventory/warehouses').then((r) => r.data.data),
  createWarehouse: (data: CreateWarehousePayload) =>
    apiClient.post('/inventory/warehouses', data).then((r) => r.data.data),

  // Suppliers
  listSuppliers: () =>
    apiClient.get('/inventory/suppliers').then((r) => r.data.data),
  getSupplier: (id: string) =>
    apiClient.get(`/inventory/suppliers/${id}`).then((r) => r.data.data),
  createSupplier: (data: CreateSupplierPayload) =>
    apiClient.post('/inventory/suppliers', data).then((r) => r.data.data),
  updateSupplier: (id: string, data: Partial<CreateSupplierPayload>) =>
    apiClient.put(`/inventory/suppliers/${id}`, data).then((r) => r.data.data),

  // Alerts & Reports
  getLowStockAlerts: () =>
    apiClient.get('/inventory/alerts/low-stock').then((r) => r.data.data),
  getExpiredItems: () =>
    apiClient.get('/inventory/alerts/expired').then((r) => r.data.data),
  getControlledSubstances: () =>
    apiClient.get('/inventory/reports/controlled-substances').then((r) => r.data.data),
  getValuation: (method?: string) =>
    apiClient.get('/inventory/reports/valuation', { params: { method } }).then((r) => r.data.data),

  // Transactions
  listTransactions: (params?: { itemId?: string; type?: string }) =>
    apiClient.get('/inventory/transactions', { params }).then((r) => r.data.data),

  // Purchase Orders
  listPos: (params?: { status?: string }) =>
    apiClient.get('/inventory/pos', { params }).then((r) => r.data.data),
  createPo: (data: CreatePoPayload) =>
    apiClient.post('/inventory/pos', data).then((r) => r.data.data),
  receivePo: (id: string, items: { id: string; quantityReceived: number }[]) =>
    apiClient.put(`/inventory/pos/${id}/receive`, { items }).then((r) => r.data.data),
};
