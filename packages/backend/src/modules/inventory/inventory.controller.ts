import type { FastifyRequest, FastifyReply } from 'fastify';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { permissionKeyMatches, type PermissionScope } from '@healthcare/shared/authz';
import type { Principal } from '../../services/authorization.js';
import { sendSuccess } from '../../utils/response.js';
import { ValidationError, NotFoundError } from '@healthcare/shared/errors';
import { logAudit } from '../../services/audit.js';
import * as repo from './inventory.repository.js';
import {
  mapSupplier, mapWarehouse, mapInventoryItem, mapInventoryTransaction,
  mapPurchaseOrder, mapLowStockAlert, mapStockValuation,
} from './inventory.mapper.js';
import {
  createSupplierSchema, updateSupplierSchema,
  createWarehouseSchema, createInventoryItemSchema, updateStockSchema,
  createAdjustmentSchema, bulkStockReceiptSchema,
  transferStockSchema, dispenseStockSchema,
  createPurchaseOrderSchema, receivePurchaseOrderSchema,
} from './inventory.schema.js';

function inventoryContext(request: FastifyRequest, permission = 'inventory.view'): { principal: Principal; scope: PermissionScope } {
  const principal = getCtx(request).principal;
  return {
    principal,
    scope: principal.grants.find((grant) => grant.permission === '*' || permissionKeyMatches(grant.permission, permission))?.scope || 'tenant',
  };
}

// ══════════════════════════════════════════
// #7: Suppliers
// ══════════════════════════════════════════

export async function listSuppliers(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const suppliers = await repo.findSuppliers(tenantId);
  try { await logAudit({ tenantId, userId, action: 'inventory.supplier.list', entityType: 'supplier' }); } catch {}
  return sendSuccess(reply, suppliers.map(mapSupplier));
}

export async function getSupplier(request: FastifyRequest, reply: FastifyReply) {
  const { supplierId } = request.params as { supplierId: string };
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const supplier = await repo.findSupplierById(supplierId, tenantId);
  if (!supplier) throw new NotFoundError('Supplier', supplierId);
  try { await logAudit({ tenantId, userId, action: 'inventory.supplier.view', entityType: 'supplier', entityId: supplierId }); } catch {}
  return sendSuccess(reply, mapSupplier(supplier));
}

export async function createSupplier(request: FastifyRequest, reply: FastifyReply) {
  const body = createSupplierSchema.parse(request.body);
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const supplier = await repo.createSupplier(tenantId, {
    name: body.name, code: body.code, contact_person: body.contactPerson || null,
    email: body.email || null, phone: body.phone || null, address: body.address || null,
    tax_id: body.taxId || null, payment_terms: body.paymentTerms || null,
    credit_limit: body.creditLimit, notes: body.notes || null,
  });
  await logAudit({ tenantId, userId, action: 'inventory.supplier.created', entityType: 'supplier', entityId: supplier.id });
  return sendSuccess(reply, mapSupplier(supplier), 'Supplier created', 201);
}

export async function updateSupplier(request: FastifyRequest, reply: FastifyReply) {
  const { supplierId } = request.params as { supplierId: string };
  const body = updateSupplierSchema.parse(request.body);
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.code !== undefined) updateData.code = body.code;
  if (body.contactPerson !== undefined) updateData.contact_person = body.contactPerson;
  if (body.email !== undefined) updateData.email = body.email;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.address !== undefined) updateData.address = body.address;
  if (body.taxId !== undefined) updateData.tax_id = body.taxId;
  if (body.paymentTerms !== undefined) updateData.payment_terms = body.paymentTerms;
  if (body.creditLimit !== undefined) updateData.credit_limit = body.creditLimit;
  if (body.notes !== undefined) updateData.notes = body.notes;
  const updated = await repo.updateSupplier(supplierId, tenantId, updateData);
  if (!updated) throw new NotFoundError('Supplier', supplierId);
  await logAudit({ tenantId, userId, action: 'inventory.supplier.updated', entityType: 'supplier', entityId: supplierId });
  return sendSuccess(reply, mapSupplier(updated), 'Supplier updated');
}

// ══════════════════════════════════════════
// Warehouses
// ══════════════════════════════════════════

export async function listWarehouses(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const warehouses = await repo.findWarehouses(tenantId, inventoryContext(request));
  try { await logAudit({ tenantId, userId, action: 'inventory.warehouse.list', entityType: 'warehouse' }); } catch {}
  return sendSuccess(reply, warehouses.map(mapWarehouse));
}

export async function createWarehouse(request: FastifyRequest, reply: FastifyReply) {
  const body = createWarehouseSchema.parse(request.body);
  const tenantId = getTenantId(request);
  const { userId, principal } = getCtx(request);
  const context = inventoryContext(request, 'inventory.create');
  const branchId = context.scope === 'branch' ? principal.branches[0] : null;
  if (context.scope === 'branch' && !branchId) throw new ValidationError('An active branch is required to create a warehouse');
  const warehouse = await repo.createWarehouse(tenantId, { ...body, branch_id: branchId });
  await logAudit({ tenantId, userId, action: 'inventory.warehouse.created', entityType: 'warehouse', entityId: warehouse.id });
  return sendSuccess(reply, mapWarehouse(warehouse), 'Warehouse created', 201);
}

// ══════════════════════════════════════════
// Inventory Items
// ══════════════════════════════════════════

export async function listItems(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const { category, warehouseId, search } = request.query as Record<string, string | undefined>;
  const items = await repo.findInventoryItems(tenantId, { category, warehouseId, search, ...inventoryContext(request) });
  try { await logAudit({ tenantId, userId, action: 'inventory.item.list', entityType: 'inventory_item' }); } catch {}
  return sendSuccess(reply, items.map(mapInventoryItem));
}

export async function getItem(request: FastifyRequest, reply: FastifyReply) {
  const { itemId } = request.params as { itemId: string };
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const item = await repo.findInventoryItemById(itemId, tenantId, inventoryContext(request));
  if (!item) throw new NotFoundError('Inventory item', itemId);
  try { await logAudit({ tenantId, userId, action: 'inventory.item.view', entityType: 'inventory_item', entityId: itemId }); } catch {}
  return sendSuccess(reply, mapInventoryItem(item));
}

// ── #9: Barcode lookup ──
export async function getItemByBarcode(request: FastifyRequest, reply: FastifyReply) {
  const { barcode } = request.params as { barcode: string };
  const tenantId = getTenantId(request);
  const item = await repo.findItemByBarcode(barcode, tenantId, inventoryContext(request));
  if (!item) throw new NotFoundError('Item with barcode', barcode);
  return sendSuccess(reply, mapInventoryItem(item));
}

export async function createItem(request: FastifyRequest, reply: FastifyReply) {
  const body = createInventoryItemSchema.parse(request.body);
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const warehouse = await repo.findWarehouseById(body.warehouseId, tenantId, inventoryContext(request, 'inventory.create'));
  if (!warehouse) throw new NotFoundError('Accessible warehouse', body.warehouseId);
  const item = await repo.createInventoryItem(tenantId, {
    warehouse_id: body.warehouseId, sku: body.sku, name: body.name,
    category: body.category || null, unit: body.unit, quantity: body.quantity,
    reorder_point: body.reorderPoint, unit_cost: body.unitCost, unit_price: body.unitPrice,
    batch_number: body.batchNumber || null, expiry_date: body.expiryDate || null,
    serial_number: body.serialNumber || null, manufacturer: body.manufacturer || null,
    supplier_id: body.supplierId || null, supplier: body.supplier || null, description: body.description || null,
    barcode: body.barcode || null,
    controlled_substance_class: body.controlledSubstanceClass || 'none',
  });
  if (body.quantity > 0) {
    await repo.insertTransaction({
      tenant_id: tenantId, item_id: item.id, type: 'receipt',
      quantity: body.quantity, quantity_before: 0, quantity_after: body.quantity,
      unit_cost: body.unitCost, notes: 'Initial stock', created_by: userId,
    });
  }
  // ── #11: Enhanced audit for controlled substances ──
  const auditAction = item.controlled_substance_class && item.controlled_substance_class !== 'none'
    ? 'inventory.controlled_substance.created'
    : 'inventory.item.created';
  await logAudit({ tenantId, userId, action: auditAction, entityType: 'inventory_item', entityId: item.id,
    metadata: { controlledClass: item.controlled_substance_class },
  });
  return sendSuccess(reply, mapInventoryItem(item), 'Item added', 201);
}

// ── Stock update ──
export async function updateStock(request: FastifyRequest, reply: FastifyReply) {
  const { itemId } = request.params as { itemId: string };
  const body = updateStockSchema.parse(request.body);
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);

  // ── #2: Prevent dispensing expired items ──
  if (body.type === 'dispensing' || body.type === 'issue') {
    const item = await repo.findInventoryItemById(itemId, tenantId, inventoryContext(request, 'inventory.edit'));
    if (item?.expiry_date) {
      const today = new Date().toISOString().split('T')[0];
      if (item.expiry_date < today) {
        throw new ValidationError(`Cannot dispense expired item (expired: ${item.expiry_date})`);
      }
    }
    // ── #11: Controlled substance check ──
    if (item?.controlled_substance_class && item.controlled_substance_class !== 'none') {
      await logAudit({ tenantId, userId, action: 'inventory.controlled_substance.dispensed',
        entityType: 'inventory_item', entityId: itemId,
        metadata: { controlledClass: item.controlled_substance_class, quantity: body.quantity },
      });
    }
  }

  const result = await repo.atomicStockUpdate(itemId, tenantId, body.quantity);
  if (!result) throw new ValidationError('Insufficient stock or item not found');

  await repo.insertTransaction({
    tenant_id: tenantId, item_id: itemId, type: body.type,
    quantity: body.quantity, quantity_before: result.before, quantity_after: result.after,
    reason_code: body.reasonCode || null, unit_cost: body.unitCost || 0,
    reference_type: body.referenceType || null, reference_id: body.referenceId || null,
    created_by: userId,
  });

  await logAudit({ tenantId, userId, action: `inventory.stock.${body.type}`, entityType: 'inventory_item', entityId: itemId,
    metadata: { quantity: body.quantity, before: result.before, after: result.after, reasonCode: body.reasonCode },
  });
  return sendSuccess(reply, { quantityBefore: result.before, quantityAfter: result.after }, 'Stock updated');
}

// ── Transactions ──
export async function listTransactions(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const { itemId, type } = request.query as Record<string, string | undefined>;
  const transactions = await repo.findTransactions(tenantId, { itemId, type, ...inventoryContext(request) });
  try { await logAudit({ tenantId, userId, action: 'inventory.transaction.list', entityType: 'inventory_item' }); } catch {}
  return sendSuccess(reply, transactions.map(mapInventoryTransaction));
}

// ══════════════════════════════════════════
// #13: Adjustment with reason codes
// ══════════════════════════════════════════

export async function createAdjustment(request: FastifyRequest, reply: FastifyReply) {
  const body = createAdjustmentSchema.parse(request.body);
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);

  const item = await repo.findInventoryItemById(body.itemId, tenantId, inventoryContext(request, 'inventory.edit'));
  if (!item) throw new NotFoundError('Inventory item', body.itemId);

  // Prevent negative stock on adjustment
  if (body.quantityChange < 0 && Math.abs(body.quantityChange) > item.quantity) {
    throw new ValidationError(`Adjustment would cause negative stock. Current: ${item.quantity}, Adjustment: ${body.quantityChange}`);
  }

  const result = await repo.atomicStockUpdate(body.itemId, tenantId, body.quantityChange);
  if (!result) throw new ValidationError('Failed to apply adjustment');

  await repo.insertTransaction({
    tenant_id: tenantId, item_id: body.itemId, type: 'adjustment',
    quantity: body.quantityChange, quantity_before: result.before, quantity_after: result.after,
    reason_code: body.reasonCode, notes: body.notes || null, created_by: userId,
  });

  await logAudit({ tenantId, userId, action: 'inventory.stock.adjustment', entityType: 'inventory_item', entityId: body.itemId,
    metadata: { reasonCode: body.reasonCode, quantityChange: body.quantityChange },
  });
  return sendSuccess(reply, { quantityBefore: result.before, quantityAfter: result.after }, 'Adjustment recorded');
}

// ══════════════════════════════════════════
// #10: Inter-warehouse transfer
// ══════════════════════════════════════════

export async function transferStock(request: FastifyRequest, reply: FastifyReply) {
  const body = transferStockSchema.parse(request.body);
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);

  if (body.fromWarehouseId === body.toWarehouseId) {
    throw new ValidationError('Source and destination warehouses must be different');
  }

  const warehouseContext = inventoryContext(request, 'inventory.create');
  const sourceWarehouse = await repo.findWarehouseById(body.fromWarehouseId, tenantId, warehouseContext);
  const destinationWarehouse = await repo.findWarehouseById(body.toWarehouseId, tenantId, warehouseContext);
  if (!sourceWarehouse || !destinationWarehouse) throw new NotFoundError('Accessible warehouse', !sourceWarehouse ? body.fromWarehouseId : body.toWarehouseId);

  const item = await repo.findInventoryItemById(body.itemId, tenantId, warehouseContext);
  if (!item) throw new NotFoundError('Inventory item', body.itemId);

  // Deduct from source
  const deductResult = await repo.atomicStockUpdate(body.itemId, tenantId, -body.quantity);
  if (!deductResult) throw new ValidationError('Insufficient stock for transfer');

  // Add to destination — find or create item in destination warehouse
  let destItem = (await repo.findInventoryItems(tenantId, { warehouseId: body.toWarehouseId, ...inventoryContext(request, 'inventory.create') }))
    .find(i => i.sku === item.sku);

  if (!destItem) {
    destItem = await repo.createInventoryItem(tenantId, {
      warehouse_id: body.toWarehouseId, sku: item.sku, name: item.name,
      category: item.category, unit: item.unit, quantity: 0,
      reorder_point: item.reorder_point, unit_cost: item.unit_cost, unit_price: item.unit_price,
      batch_number: item.batch_number, expiry_date: item.expiry_date,
      manufacturer: item.manufacturer, supplier: item.supplier, supplier_id: item.supplier_id,
      barcode: item.barcode, controlled_substance_class: item.controlled_substance_class,
    });
  }

  const addResult = await repo.atomicStockUpdate(destItem.id, tenantId, body.quantity);
  if (!addResult) throw new ValidationError('Failed to add stock to destination');

  // Record transfer on source
  await repo.insertTransaction({
    tenant_id: tenantId, item_id: body.itemId, type: 'transfer',
    quantity: -body.quantity, quantity_before: deductResult.before, quantity_after: deductResult.after,
    from_warehouse_id: body.fromWarehouseId, to_warehouse_id: body.toWarehouseId,
    notes: body.notes || `Transfer to warehouse`, created_by: userId,
  });

  // Record transfer on destination
  await repo.insertTransaction({
    tenant_id: tenantId, item_id: destItem.id, type: 'transfer',
    quantity: body.quantity, quantity_before: addResult.before, quantity_after: addResult.after,
    from_warehouse_id: body.fromWarehouseId, to_warehouse_id: body.toWarehouseId,
    notes: body.notes || `Transfer from warehouse`, created_by: userId,
  });

  await logAudit({ tenantId, userId, action: 'inventory.stock.transfer', entityType: 'inventory_item', entityId: body.itemId,
    metadata: { from: body.fromWarehouseId, to: body.toWarehouseId, quantity: body.quantity },
  });
  return sendSuccess(reply, null, 'Transfer completed');
}

// ══════════════════════════════════════════
// #5: Low stock alerts
// ══════════════════════════════════════════

export async function getLowStockAlerts(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = getTenantId(request);
  const items = await repo.findLowStockItems(tenantId, inventoryContext(request));
  return sendSuccess(reply, items.map(mapLowStockAlert));
}

// ── #2: Expired items ──
export async function getExpiredItems(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const items = await repo.findExpiredItems(tenantId, inventoryContext(request));
  try { await logAudit({ tenantId, userId, action: 'inventory.alert.expired', entityType: 'inventory_item' }); } catch {}
  return sendSuccess(reply, items.map(mapInventoryItem));
}

// ── #11: Controlled substance inventory ──
export async function getControlledSubstances(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const items = await repo.findControlledSubstances(tenantId, inventoryContext(request));
  await logAudit({ tenantId, userId, action: 'inventory.controlled_substance.viewed', entityType: 'inventory_item',
    metadata: { count: items.length },
  });
  return sendSuccess(reply, items.map(mapInventoryItem));
}

// ══════════════════════════════════════════
// #12: Stock valuation
// ══════════════════════════════════════════

export async function getStockValuation(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = getTenantId(request);
  const { method } = request.query as { method?: string };

  if (method === 'fifo') {
    const valuations = await repo.getFifoValuation(tenantId, inventoryContext(request));
    const result = valuations.map(v => ({
      itemId: v.item_id, itemName: v.item_name,
      totalQuantity: v.total_quantity, fifoCost: Number(v.fifo_cost),
      totalValue: v.total_quantity * Number(v.fifo_cost), method: 'fifo',
    }));
    return sendSuccess(reply, result);
  }

  // Default: weighted average
  const valuations = await repo.getStockValuation(tenantId, inventoryContext(request));
  return sendSuccess(reply, valuations.map(mapStockValuation));
}

// ══════════════════════════════════════════
// #6: Dispensing integration
// ══════════════════════════════════════════

export async function dispenseStock(request: FastifyRequest, reply: FastifyReply) {
  const body = dispenseStockSchema.parse(request.body);
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);

  const item = await repo.findInventoryItemById(body.itemId, tenantId, inventoryContext(request, 'inventory.edit'));
  if (!item) throw new NotFoundError('Inventory item', body.itemId);

  // ── #2: Prevent dispensing expired items ──
  if (item.expiry_date) {
    const today = new Date().toISOString().split('T')[0];
    if (item.expiry_date < today) {
      throw new ValidationError(`Cannot dispense expired item '${item.name}' (expired: ${item.expiry_date})`);
    }
  }

  // ── #11: Controlled substance requires audit ──
  if (item.controlled_substance_class && item.controlled_substance_class !== 'none') {
    await logAudit({ tenantId, userId, action: 'inventory.controlled_substance.dispensed',
      entityType: 'inventory_item', entityId: body.itemId,
      metadata: { controlledClass: item.controlled_substance_class, quantity: body.quantity, patientId: body.patientId },
    });
  }

  const result = await repo.atomicStockUpdate(body.itemId, tenantId, -body.quantity);
  if (!result) throw new ValidationError(`Insufficient stock for '${item.name}'. Available: ${item.quantity}`);

  const notes = [
    body.notes || '',
    body.patientId ? `Patient: ${body.patientId}` : '',
    body.appointmentId ? `Appointment: ${body.appointmentId}` : '',
  ].filter(Boolean).join(' | ');

  await repo.insertTransaction({
    tenant_id: tenantId, item_id: body.itemId, type: 'dispensing',
    quantity: -body.quantity, quantity_before: result.before, quantity_after: result.after,
    unit_cost: item.unit_cost, notes: notes || null, created_by: userId,
  });

  await logAudit({ tenantId, userId, action: 'inventory.dispensed', entityType: 'inventory_item', entityId: body.itemId,
    metadata: { quantity: body.quantity, patientId: body.patientId, appointmentId: body.appointmentId },
  });
  return sendSuccess(reply, { quantityBefore: result.before, quantityAfter: result.after, itemName: item.name }, 'Stock dispensed');
}

// ══════════════════════════════════════════
// #16: Bulk stock receipt
// ══════════════════════════════════════════

export async function bulkStockReceipt(request: FastifyRequest, reply: FastifyReply) {
  const body = bulkStockReceiptSchema.parse(request.body);
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);

  const results: { itemId: string; before: number; after: number }[] = [];
  const errors: string[] = [];

  for (const entry of body.items) {
    const item = await repo.findInventoryItemById(entry.itemId, tenantId, inventoryContext(request, 'inventory.create'));
    if (!item) {
      errors.push(`Item ${entry.itemId} not found`);
      continue;
    }

    const result = await repo.atomicStockUpdate(entry.itemId, tenantId, entry.quantity);
    if (!result) {
      errors.push(`Failed to update stock for ${item.name}`);
      continue;
    }

    await repo.insertTransaction({
      tenant_id: tenantId, item_id: entry.itemId, type: 'receipt',
      quantity: entry.quantity, quantity_before: result.before, quantity_after: result.after,
      unit_cost: entry.unitCost || 0, notes: entry.notes || 'Bulk receipt',
      reference_type: body.referenceType || null, reference_id: body.referenceId || null,
      created_by: userId,
    });

    results.push({ itemId: entry.itemId, before: result.before, after: result.after });
  }

  await logAudit({ tenantId, userId, action: 'inventory.bulk_receipt', entityType: 'inventory_item',
    metadata: { count: results.length, errors: errors.length },
  });
  return sendSuccess(reply, { received: results, errors }, 'Bulk receipt completed', errors.length > 0 ? 207 : 200);
}

// ══════════════════════════════════════════
// Purchase Orders
// ══════════════════════════════════════════

export async function listPurchaseOrders(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  const { status } = request.query as { status?: string };
  const pos = await repo.findPurchaseOrders(tenantId, status, inventoryContext(request));
  const posWithItems = await Promise.all(
    pos.map(async (po) => {
      const items = await repo.findPurchaseOrderItems(po.id, tenantId);
      return mapPurchaseOrder(po, items);
    }),
  );
  try { await logAudit({ tenantId, userId, action: 'inventory.po.list', entityType: 'purchase_order' }); } catch {}
  return sendSuccess(reply, posWithItems);
}

export async function getPurchaseOrder(request: FastifyRequest, reply: FastifyReply) {
  const { poId } = request.params as { poId: string };
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);

  const po = await repo.findPurchaseOrderById(poId, tenantId, inventoryContext(request));
  if (!po) throw new NotFoundError('Purchase order', poId);

  const items = await repo.findPurchaseOrderItems(poId, tenantId);
  try { await logAudit({ tenantId, userId, action: 'inventory.po.view', entityType: 'purchase_order', entityId: poId }); } catch {}
  return sendSuccess(reply, mapPurchaseOrder(po, items));
}

export async function createPurchaseOrder(request: FastifyRequest, reply: FastifyReply) {
  const body = createPurchaseOrderSchema.parse(request.body);
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);
  if (body.warehouseId) {
    const warehouse = await repo.findWarehouseById(body.warehouseId, tenantId, inventoryContext(request, 'inventory.create'));
    if (!warehouse) throw new NotFoundError('Accessible warehouse', body.warehouseId);
  }
  const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
  let totalAmount = 0;
  for (const item of body.items) totalAmount += item.quantityOrdered * item.unitCost;

  const po = await repo.createPurchaseOrder({
    tenant_id: tenantId, warehouse_id: body.warehouseId || null,
    po_number: poNumber, supplier: body.supplier, total_amount: totalAmount,
    order_date: body.orderDate || new Date().toISOString().split('T')[0],
    expected_date: body.expectedDate || null, notes: body.notes || null, created_by: userId,
  });
  await repo.insertPurchaseOrderItems(body.items.map((item) => ({
    po_id: po.id, item_id: item.itemId || null, item_name: item.itemName,
    sku: item.sku || null, quantity_ordered: item.quantityOrdered,
    unit_cost: item.unitCost, total_cost: item.quantityOrdered * item.unitCost,
  })));
  await logAudit({ tenantId, userId, action: 'inventory.po.created', entityType: 'purchase_order', entityId: po.id });
  return sendSuccess(reply, { id: po.id, poNumber: po.po_number }, 'Purchase order created', 201);
}

export async function receivePurchaseOrder(request: FastifyRequest, reply: FastifyReply) {
  const { poId } = request.params as { poId: string };
  const body = receivePurchaseOrderSchema.parse(request.body);
  const tenantId = getTenantId(request);
  const { userId } = getCtx(request);

  const purchaseOrder = await repo.findPurchaseOrderById(poId, tenantId, inventoryContext(request, 'inventory.edit'));
  if (!purchaseOrder) throw new NotFoundError('Purchase order', poId);

  for (const received of body.items) {
    await repo.updatePurchaseOrderItem(received.id, tenantId, { quantity_received: received.quantityReceived });
    const poi = await repo.findPurchaseOrderItemById(received.id, tenantId);
    if (poi?.item_id) {
      const result = await repo.atomicStockUpdate(poi.item_id, tenantId, received.quantityReceived);
      if (result) {
        await repo.insertTransaction({
          tenant_id: tenantId, item_id: poi.item_id, type: 'receipt',
          quantity: received.quantityReceived, quantity_before: result.before, quantity_after: result.after,
          unit_cost: poi.unit_cost, reference_type: 'purchase_order', reference_id: poId, created_by: userId,
        });
      }
    }
  }
  await repo.updatePurchaseOrder(poId, tenantId, {
    status: 'received', received_date: new Date().toISOString().split('T')[0], updated_at: new Date(),
  });
  await logAudit({ tenantId, userId, action: 'inventory.po.received', entityType: 'purchase_order', entityId: poId });
  return sendSuccess(reply, null, 'PO received');
}
