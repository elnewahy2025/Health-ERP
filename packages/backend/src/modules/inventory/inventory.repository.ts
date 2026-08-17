import { db } from '../../core/database.js';
import type {
  WarehouseRow, InventoryItemRow, InventoryTransactionRow,
  PurchaseOrderRow, PurchaseOrderItemRow, SupplierRow,
} from './types.js';
import type { PermissionScope } from '@healthcare/shared/authz';
import type { Principal } from '../../services/authorization.js';
import { applyScopePolicy } from '../../services/scope-policy.js';

type InventoryScope = { principal?: Principal; scope?: PermissionScope };

// ── #7: Suppliers ──

export async function findSuppliers(tenantId: string): Promise<SupplierRow[]> {
  return db('suppliers')
    .where({ tenant_id: tenantId, status: 'active' })
    .orderBy('name');
}

export async function findSupplierById(supplierId: string, tenantId: string): Promise<SupplierRow | undefined> {
  return db('suppliers')
    .where({ id: supplierId, tenant_id: tenantId })
    .first();
}

export async function createSupplier(tenantId: string, data: Record<string, unknown>): Promise<SupplierRow> {
  const [supplier] = await db('suppliers')
    .insert({ tenant_id: tenantId, ...data })
    .returning('*');
  return supplier;
}

export async function updateSupplier(
  supplierId: string, tenantId: string, data: Record<string, unknown>,
): Promise<SupplierRow | undefined> {
  const [updated] = await db('suppliers')
    .where({ id: supplierId, tenant_id: tenantId })
    .update({ ...data, updated_at: new Date() })
    .returning('*');
  return updated;
}

// ── Warehouses ──

export async function findWarehouses(tenantId: string, context?: InventoryScope): Promise<WarehouseRow[]> {
  let query = db('warehouses').where({ 'warehouses.tenant_id': tenantId, 'warehouses.status': 'active' });
  if (context?.principal && context.scope) query = applyScopePolicy('inventory_warehouses', query, context.principal, context.scope) as typeof query;
  return query.select('warehouses.*').orderBy('warehouses.name');
}

export async function findWarehouseById(warehouseId: string, tenantId: string, context?: InventoryScope): Promise<WarehouseRow | undefined> {
  let query = db('warehouses').where({ 'warehouses.id': warehouseId, 'warehouses.tenant_id': tenantId });
  if (context?.principal && context.scope) query = applyScopePolicy('inventory_warehouses', query, context.principal, context.scope) as typeof query;
  return query.select('warehouses.*').first();
}

export async function createWarehouse(
  tenantId: string, data: { name: string; code: string; type: string },
): Promise<WarehouseRow> {
  const [wh] = await db('warehouses')
    .insert({ tenant_id: tenantId, ...data })
    .returning('*');
  return wh;
}

// ── Inventory Items ──

export async function findInventoryItems(
  tenantId: string,
  filters: { category?: string; warehouseId?: string; search?: string } & InventoryScope,
): Promise<(InventoryItemRow & { wh_name?: string })[]> {
  let query = db('inventory_items')
    .where('inventory_items.tenant_id', tenantId)
    .whereNull('inventory_items.deleted_at');

  if (filters.category) query = query.andWhere('inventory_items.category', filters.category);
  if (filters.warehouseId) query = query.andWhere('inventory_items.warehouse_id', filters.warehouseId);
  if (filters.search) {
    const s = filters.search;
    query = query.andWhere(function () {
      this.where('inventory_items.name', 'ilike', `%${s}%`)
        .orWhere('inventory_items.sku', 'ilike', `%${s}%`)
        .orWhere('inventory_items.barcode', 'ilike', `%${s}%`);
    });
  }

  query = query.leftJoin('warehouses', 'inventory_items.warehouse_id', 'warehouses.id');
  if (filters.principal && filters.scope) query = applyScopePolicy('inventory', query, filters.principal, filters.scope) as typeof query;
  return query
    .select('inventory_items.*', 'warehouses.name as wh_name')
    .orderBy('inventory_items.name');
}

export async function findInventoryItemById(
  itemId: string, tenantId: string, context?: InventoryScope,
): Promise<InventoryItemRow | undefined> {
  let query = db('inventory_items')
    .leftJoin('warehouses', 'inventory_items.warehouse_id', 'warehouses.id')
    .where({ 'inventory_items.id': itemId, 'inventory_items.tenant_id': tenantId })
    .whereNull('inventory_items.deleted_at');
  if (context?.principal && context.scope) query = applyScopePolicy('inventory', query, context.principal, context.scope) as typeof query;
  return query.select('inventory_items.*').first();
}

// ── #9: Barcode lookup ──
export async function findItemByBarcode(
  barcode: string, tenantId: string, context?: InventoryScope,
): Promise<(InventoryItemRow & { wh_name?: string }) | undefined> {
  let query = db('inventory_items')
    .leftJoin('warehouses', 'inventory_items.warehouse_id', 'warehouses.id')
    .where('inventory_items.barcode', barcode)
    .where('inventory_items.tenant_id', tenantId)
    .whereNull('inventory_items.deleted_at');
  if (context?.principal && context.scope) query = applyScopePolicy('inventory', query, context.principal, context.scope) as typeof query;
  return query.select('inventory_items.*', 'warehouses.name as wh_name').first();
}

export async function createInventoryItem(
  tenantId: string, data: Record<string, unknown>,
): Promise<InventoryItemRow> {
  const [item] = await db('inventory_items')
    .insert({ tenant_id: tenantId, ...data })
    .returning('*');
  return item;
}

// ── #4: Atomic stock update (race-condition safe) ──
export async function atomicStockUpdate(
  itemId: string, tenantId: string, quantityChange: number,
): Promise<{ before: number; after: number } | undefined> {
  if (quantityChange < 0) {
    const result = await db('inventory_items')
      .where({ id: itemId, tenant_id: tenantId })
      .where('quantity', '>=', Math.abs(quantityChange))
      .update({
        quantity: db.raw('quantity + ?', [quantityChange]),
        updated_at: new Date(),
      });
    if (result === 0) return undefined;
    const updated = await db('inventory_items')
      .where({ id: itemId, tenant_id: tenantId }).first();
    return { before: updated.quantity - quantityChange, after: updated.quantity };
  } else {
    const item = await db('inventory_items')
      .where({ id: itemId, tenant_id: tenantId }).first();
    if (!item) return undefined;
    const before = item.quantity;
    const after = before + quantityChange;
    await db('inventory_items')
      .where({ id: itemId, tenant_id: tenantId })
      .update({ quantity: after, last_restocked_at: new Date(), updated_at: new Date() });
    return { before, after };
  }
}

// ── #2+#3: FEFO — find earliest-expiring item in warehouse ──
export async function findFifoItem(
  tenantId: string, warehouseId: string, sku: string,
): Promise<InventoryItemRow | undefined> {
  return db('inventory_items')
    .where({
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      sku,
    })
    .whereNull('deleted_at')
    .where('quantity', '>', 0)
    .whereNotNull('expiry_date')
    .orderBy('expiry_date', 'asc')
    .first();
}

// ── #2: Check for expired items ──
export async function findExpiredItems(
  tenantId: string, context?: InventoryScope,
): Promise<(InventoryItemRow & { wh_name?: string })[]> {
  let query = db('inventory_items')
    .leftJoin('warehouses', 'inventory_items.warehouse_id', 'warehouses.id')
    .where('inventory_items.tenant_id', tenantId)
    .whereNull('inventory_items.deleted_at');
  if (context?.principal && context.scope) query = applyScopePolicy('inventory', query, context.principal, context.scope) as typeof query;
  return query
    .where('inventory_items.expiry_date', '<', new Date().toISOString().split('T')[0])
    .where('inventory_items.quantity', '>', 0)
    .select('inventory_items.*', 'warehouses.name as wh_name')
    .orderBy('inventory_items.expiry_date', 'asc');
}

// ── #5: Low stock alerts ──
export async function findLowStockItems(
  tenantId: string, context?: InventoryScope,
): Promise<(InventoryItemRow & { wh_name?: string })[]> {
  let query = db('inventory_items')
    .leftJoin('warehouses', 'inventory_items.warehouse_id', 'warehouses.id')
    .where('inventory_items.tenant_id', tenantId)
    .whereNull('inventory_items.deleted_at');
  if (context?.principal && context.scope) query = applyScopePolicy('inventory', query, context.principal, context.scope) as typeof query;
  return query
    .whereRaw('inventory_items.quantity <= inventory_items.reorder_point')
    .where('inventory_items.status', '!=', 'discontinued')
    .select('inventory_items.*', 'warehouses.name as wh_name')
    .orderByRaw('inventory_items.quantity - inventory_items.reorder_point ASC');
}

// ── #11: Controlled substance items ──
export async function findControlledSubstances(
  tenantId: string, context?: InventoryScope,
): Promise<(InventoryItemRow & { wh_name?: string })[]> {
  let query = db('inventory_items')
    .leftJoin('warehouses', 'inventory_items.warehouse_id', 'warehouses.id')
    .where('inventory_items.tenant_id', tenantId)
    .whereNull('inventory_items.deleted_at');
  if (context?.principal && context.scope) query = applyScopePolicy('inventory', query, context.principal, context.scope) as typeof query;
  return query
    .where('inventory_items.controlled_substance_class', '!=', 'none')
    .whereNotNull('inventory_items.controlled_substance_class')
    .where('inventory_items.quantity', '>', 0)
    .select('inventory_items.*', 'warehouses.name as wh_name')
    .orderBy('inventory_items.controlled_substance_class');
}

// ── Transactions ──

export async function insertTransaction(data: {
  tenant_id: string;
  item_id: string;
  type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  reason_code?: string | null;
  unit_cost?: number;
  reference_type?: string | null;
  reference_id?: string | null;
  from_warehouse_id?: string | null;
  to_warehouse_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
}): Promise<InventoryTransactionRow> {
  const [tx] = await db('inventory_transactions').insert(data).returning('*');
  return tx;
}

export async function findTransactions(
  tenantId: string,
  filters: { itemId?: string; type?: string } & InventoryScope,
): Promise<(InventoryTransactionRow & { item_name?: string })[]> {
  let query = db('inventory_transactions')
    .leftJoin('inventory_items', 'inventory_transactions.item_id', 'inventory_items.id')
    .leftJoin('warehouses', 'inventory_items.warehouse_id', 'warehouses.id')
    .where('inventory_transactions.tenant_id', tenantId);
  if (filters.principal && filters.scope) query = applyScopePolicy('inventory', query, filters.principal, filters.scope) as typeof query;
  if (filters.itemId) query = query.andWhere('inventory_transactions.item_id', filters.itemId);
  if (filters.type) query = query.andWhere('inventory_transactions.type', filters.type);

  return query
    .select('inventory_transactions.*', 'inventory_items.name as item_name')
    .orderBy('inventory_transactions.created_at', 'desc')
    .limit(200);
}

// ── #12: Stock valuation (weighted average cost) ──
export async function getStockValuation(
  tenantId: string, context?: InventoryScope,
): Promise<{ item_id: string; item_name: string; total_quantity: number; avg_cost: number }[]> {
  let query = db('inventory_items')
    .leftJoin('warehouses', 'inventory_items.warehouse_id', 'warehouses.id')
    .where('inventory_items.tenant_id', tenantId)
    .whereNull('inventory_items.deleted_at');
  if (context?.principal && context.scope) query = applyScopePolicy('inventory', query, context.principal, context.scope) as typeof query;
  return query
    .whereNull('inventory_items.deleted_at')
    .where('inventory_items.quantity', '>', 0)
    .select(
      'inventory_items.id as item_id',
      'inventory_items.name as item_name',
      'inventory_items.quantity as total_quantity',
      'inventory_items.unit_cost as avg_cost',
    )
    .orderBy('inventory_items.name');
}

// ── #12: FIFO valuation — cost based on receipt transactions in order ──
export async function getFifoValuation(
  tenantId: string, context?: InventoryScope,
): Promise<{ item_id: string; item_name: string; total_quantity: number; fifo_cost: number }[]> {
  let itemQuery = db('inventory_items')
    .leftJoin('warehouses', 'inventory_items.warehouse_id', 'warehouses.id')
    .where('inventory_items.tenant_id', tenantId)
    .whereNull('inventory_items.deleted_at');
  if (context?.principal && context.scope) itemQuery = applyScopePolicy('inventory', itemQuery, context.principal, context.scope) as typeof itemQuery;
  const items = await itemQuery
    .where('inventory_items.quantity', '>', 0)
    .select('inventory_items.id', 'inventory_items.name', 'inventory_items.quantity as total_quantity')
    .orderBy('inventory_items.name');

  const results = [];
  for (const item of items) {
    const receipts = await db('inventory_transactions')
      .where({
        tenant_id: tenantId,
        item_id: item.id,
        type: 'receipt',
      })
      .where('quantity_after', '>', 0)
      .orderBy('created_at', 'asc')
      .select('quantity', 'unit_cost', 'quantity_after');

    let remaining = item.total_quantity;
    let totalCost = 0;

    for (const receipt of receipts) {
      if (remaining <= 0) break;
      const qty = Math.min(remaining, receipt.quantity);
      totalCost += qty * Number(receipt.unit_cost);
      remaining -= qty;
    }

    results.push({
      item_id: item.id,
      item_name: item.name,
      total_quantity: item.total_quantity,
      fifo_cost: remaining > 0 ? totalCost / (item.total_quantity - remaining) : 0,
    });
  }

  return results;
}

// ── Purchase Orders ──

export async function findPurchaseOrders(
  tenantId: string, status?: string, context?: InventoryScope,
): Promise<PurchaseOrderRow[]> {
  let query = db('purchase_orders')
    .leftJoin('warehouses', 'purchase_orders.warehouse_id', 'warehouses.id')
    .where('purchase_orders.tenant_id', tenantId)
    .whereNull('purchase_orders.deleted_at');
  if (context?.principal && context.scope) query = applyScopePolicy('inventory_purchase_orders', query, context.principal, context.scope) as typeof query;
  if (status) query = query.andWhere('purchase_orders.status', status);
  return query.select('purchase_orders.*').orderBy('purchase_orders.created_at', 'desc').limit(50);
}

export async function findPurchaseOrderById(poId: string, tenantId: string, context?: InventoryScope): Promise<PurchaseOrderRow | undefined> {
  let query = db('purchase_orders')
    .leftJoin('warehouses', 'purchase_orders.warehouse_id', 'warehouses.id')
    .where({ 'purchase_orders.id': poId, 'purchase_orders.tenant_id': tenantId });
  if (context?.principal && context.scope) query = applyScopePolicy('inventory_purchase_orders', query, context.principal, context.scope) as typeof query;
  return query.select('purchase_orders.*').first();
}

export async function findPurchaseOrderItems(poId: string, tenantId: string): Promise<PurchaseOrderItemRow[]> {
  return db('purchase_order_items')
    .join('purchase_orders', 'purchase_order_items.po_id', 'purchase_orders.id')
    .where('purchase_order_items.po_id', poId)
    .where('purchase_orders.tenant_id', tenantId)
    .select('purchase_order_items.*');
}

export async function createPurchaseOrder(data: Record<string, unknown>): Promise<PurchaseOrderRow> {
  const [po] = await db('purchase_orders').insert(data).returning('*');
  return po;
}

export async function insertPurchaseOrderItems(items: Record<string, unknown>[]): Promise<void> {
  await db('purchase_order_items').insert(items);
}

export async function updatePurchaseOrderItem(itemId: string, tenantId: string, data: Record<string, unknown>): Promise<void> {
  await db('purchase_order_items')
    .join('purchase_orders', 'purchase_order_items.po_id', 'purchase_orders.id')
    .where('purchase_order_items.id', itemId)
    .where('purchase_orders.tenant_id', tenantId)
    .update(data);
}

export async function findPurchaseOrderItemById(poItemId: string, tenantId: string): Promise<PurchaseOrderItemRow | undefined> {
  return db('purchase_order_items')
    .join('purchase_orders', 'purchase_order_items.po_id', 'purchase_orders.id')
    .where('purchase_order_items.id', poItemId)
    .where('purchase_orders.tenant_id', tenantId)
    .select('purchase_order_items.*')
    .first();
}

export async function updatePurchaseOrder(poId: string, tenantId: string, data: Record<string, unknown>): Promise<void> {
  await db('purchase_orders').where({ id: poId, tenant_id: tenantId }).update(data);
}
