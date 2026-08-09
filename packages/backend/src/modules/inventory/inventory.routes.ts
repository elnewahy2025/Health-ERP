import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import {
  listSuppliers, getSupplier, createSupplier, updateSupplier,
  listWarehouses, createWarehouse,
  listItems, getItem, getItemByBarcode, createItem, updateStock,
  listTransactions,
  createAdjustment, transferStock, dispenseStock, bulkStockReceipt,
  getLowStockAlerts, getExpiredItems, getControlledSubstances, getStockValuation,
  listPurchaseOrders, getPurchaseOrder, createPurchaseOrder, receivePurchaseOrder,
} from './inventory.controller.js';

export async function registerInventoryRoutes(app: FastifyInstance) {
  // ── #7: Suppliers ──
  app.get('/api/v1/inventory/suppliers', { preHandler: [authenticate, authorize('inventory.view')] }, listSuppliers);
  app.get('/api/v1/inventory/suppliers/:supplierId', { preHandler: [authenticate, authorize('inventory.view')] }, getSupplier);
  app.post('/api/v1/inventory/suppliers', { preHandler: [authenticate, authorize('inventory.create')] }, createSupplier);
  app.put('/api/v1/inventory/suppliers/:supplierId', { preHandler: [authenticate, authorize('inventory.edit')] }, updateSupplier);

  // Warehouses
  app.get('/api/v1/inventory/warehouses', { preHandler: [authenticate, authorize('inventory.view')] }, listWarehouses);
  app.post('/api/v1/inventory/warehouses', { preHandler: [authenticate, authorize('inventory.create')] }, createWarehouse);

  // Inventory Items
  app.get('/api/v1/inventory/items', { preHandler: [authenticate, authorize('inventory.view')] }, listItems);
  app.get('/api/v1/inventory/items/:itemId', { preHandler: [authenticate, authorize('inventory.view')] }, getItem);
  app.get('/api/v1/inventory/barcode/:barcode', { preHandler: [authenticate, authorize('inventory.view')] }, getItemByBarcode);
  app.post('/api/v1/inventory/items', { preHandler: [authenticate, authorize('inventory.create')] }, createItem);
  app.put('/api/v1/inventory/items/:itemId/stock', { preHandler: [authenticate, authorize('inventory.edit')] }, updateStock);

  // ── #6: Dispensing ──
  app.post('/api/v1/inventory/dispense', { preHandler: [authenticate, authorize('inventory.create')] }, dispenseStock);

  // ── #13: Adjustments ──
  app.post('/api/v1/inventory/adjustments', { preHandler: [authenticate, authorize('inventory.edit')] }, createAdjustment);

  // ── #10: Transfers ──
  app.post('/api/v1/inventory/transfers', { preHandler: [authenticate, authorize('inventory.create')] }, transferStock);

  // ── #16: Bulk receipt ──
  app.post('/api/v1/inventory/bulk-receipt', { preHandler: [authenticate, authorize('inventory.create')] }, bulkStockReceipt);

  // ── #5: Alerts & Reports ──
  app.get('/api/v1/inventory/alerts/low-stock', { preHandler: [authenticate, authorize('inventory.view')] }, getLowStockAlerts);
  app.get('/api/v1/inventory/alerts/expired', { preHandler: [authenticate, authorize('inventory.view')] }, getExpiredItems);
  app.get('/api/v1/inventory/reports/controlled-substances', { preHandler: [authenticate, authorize('inventory.export')] }, getControlledSubstances);
  app.get('/api/v1/inventory/reports/valuation', { preHandler: [authenticate, authorize('inventory.view')] }, getStockValuation);

  // Transactions
  app.get('/api/v1/inventory/transactions', { preHandler: [authenticate, authorize('inventory.view')] }, listTransactions);

  // Purchase Orders
  app.get('/api/v1/inventory/pos', { preHandler: [authenticate, authorize('inventory.view')] }, listPurchaseOrders);
  app.get('/api/v1/inventory/pos/:poId', { preHandler: [authenticate, authorize('inventory.view')] }, getPurchaseOrder);
  app.post('/api/v1/inventory/pos', { preHandler: [authenticate, authorize('inventory.create')] }, createPurchaseOrder);
  app.put('/api/v1/inventory/pos/:poId/receive', { preHandler: [authenticate, authorize('inventory.edit')] }, receivePurchaseOrder);
}
