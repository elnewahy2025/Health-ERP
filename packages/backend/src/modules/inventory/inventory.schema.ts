import { z } from 'zod';

// ── #7: Supplier schemas ──
export const createSupplierSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  contactPerson: z.string().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(2000).optional(),
  taxId: z.string().max(100).optional(),
  paymentTerms: z.string().max(100).optional(),
  creditLimit: z.number().min(0).default(0),
  notes: z.string().max(2000).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

// ── Warehouse ──
export const createWarehouseSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  type: z.enum(['main', 'pharmacy', 'supplies', 'equipment']).default('main'),
});

// ── Inventory Item ──
export const createInventoryItemSchema = z.object({
  warehouseId: z.string().uuid(),
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  category: z.string().max(100).optional(),
  unit: z.string().max(30).default('piece'),
  quantity: z.number().int().min(0).default(0),
  reorderPoint: z.number().int().min(0).default(10),
  unitCost: z.number().min(0).default(0),
  unitPrice: z.number().min(0).default(0),
  batchNumber: z.string().max(100).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  serialNumber: z.string().max(200).optional(),
  manufacturer: z.string().max(200).optional(),
  supplierId: z.string().uuid().optional(),
  supplier: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  barcode: z.string().max(100).optional(),
  controlledSubstanceClass: z.enum(['none', 'I', 'II', 'III', 'IV', 'V']).default('none'),
});

// ── Stock update ──
export const updateStockSchema = z.object({
  quantity: z.number().int(),
  type: z.enum(['receipt', 'issue', 'adjustment', 'transfer', 'return', 'dispensing', 'disposal']),
  referenceType: z.string().max(50).optional(),
  referenceId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
  reasonCode: z.enum([
    'damaged', 'expired', 'stolen', 'counted_discrepancy',
    'patient_dispensed', 'returned_by_patient', 'disposed',
    'manufacturer_recall', 'initial_stock', 'manual_adjustment',
  ]).optional(),
  unitCost: z.number().min(0).optional(),
  toWarehouseId: z.string().uuid().optional(),
});

// ── #13: Adjustment with reason codes ──
export const createAdjustmentSchema = z.object({
  itemId: z.string().uuid(),
  quantityChange: z.number().int().refine((val) => val !== 0, 'Quantity change cannot be zero'),
  reasonCode: z.enum([
    'damaged', 'expired', 'stolen', 'counted_discrepancy',
    'disposed', 'manufacturer_recall', 'manual_adjustment',
  ]),
  notes: z.string().max(1000).optional(),
});

// ── #16: Bulk stock receipt ──
export const bulkStockReceiptSchema = z.object({
  items: z.array(z.object({
    itemId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitCost: z.number().min(0).optional(),
    batchNumber: z.string().max(100).optional(),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().max(500).optional(),
  })).min(1).max(100),
  supplierId: z.string().uuid().optional(),
  referenceType: z.string().max(50).optional(),
  referenceId: z.string().uuid().optional(),
});

// ── #10: Transfer schema ──
export const transferStockSchema = z.object({
  itemId: z.string().uuid(),
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  quantity: z.number().int().positive(),
  notes: z.string().max(1000).optional(),
});

// ── #6: Dispensing schema ──
export const dispenseStockSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  patientId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
  useFefo: z.boolean().default(true),
});

// ── Purchase Orders ──
export const createPurchaseOrderSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  supplier: z.string().min(1).max(200),
  supplierId: z.string().uuid().optional(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(z.object({
    itemId: z.string().uuid().optional(),
    itemName: z.string().min(1).max(200),
    sku: z.string().max(50).optional(),
    quantityOrdered: z.number().int().positive(),
    unitCost: z.number().min(0).default(0),
  })).min(1),
});

export const receivePurchaseOrderSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    quantityReceived: z.number().int().min(0),
  })).min(1),
});
