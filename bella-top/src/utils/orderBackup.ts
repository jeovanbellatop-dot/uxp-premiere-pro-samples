/**
 * src/utils/orderBackup.ts
 * Utilitários para resiliência e persistência local de Ordens de Produção (OP).
 *
 * Garante que:
 * 1. OPs com fotos/layouts compactados permaneçam salvas localmente mesmo se a rede falhar.
 * 2. O status de sincronização pendente sobreviva a recargas do navegador.
 * 3. O histórico e os dados das OPs existentes jamais sejam apagados.
 */

import { ProductionOrder } from '../types/mes';
import { isBulkyMedia } from '../../shared/orderMedia';

const BACKUP_STORAGE_KEYS = {
  ORDERS_CACHE: 'bellatop_orders_backup_v1',
  PENDING_PUSH: 'bellatop_pending_ops_backup_v1',
};

export const OrderBackupService = {
  /**
   * Salva um backup de segurança das OPs locais
   */
  saveLocalBackup(orders: ProductionOrder[], pendingIds: Set<string> | string[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const sanitized = orders.map((o) => ({
        ...o,
        layoutImage: isBulkyMedia(o.layoutImage) ? undefined : o.layoutImage,
        layoutPreviewImage: isBulkyMedia(o.layoutPreviewImage) ? undefined : o.layoutPreviewImage,
        productThumbnail: isBulkyMedia(o.productThumbnail, 100 * 1024) ? undefined : o.productThumbnail,
      }));
      localStorage.setItem(BACKUP_STORAGE_KEYS.ORDERS_CACHE, JSON.stringify(sanitized));
      localStorage.setItem(
        BACKUP_STORAGE_KEYS.PENDING_PUSH,
        JSON.stringify(Array.from(pendingIds))
      );
    } catch (err) {
      console.warn('[OrderBackupService] Falha ao persistir backup secundário:', err);
    }
  },

  /**
   * Recupera o backup de OPs locais em caso de necessidade de restauração
   */
  loadLocalBackup(): { orders: ProductionOrder[]; pendingIds: Set<string> } | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const rawOrders = localStorage.getItem(BACKUP_STORAGE_KEYS.ORDERS_CACHE);
      const rawPending = localStorage.getItem(BACKUP_STORAGE_KEYS.PENDING_PUSH);
      if (!rawOrders) return null;
      const orders = JSON.parse(rawOrders) as ProductionOrder[];
      const pendingIds = new Set<string>(rawPending ? JSON.parse(rawPending) : []);
      return { orders, pendingIds };
    } catch {
      return null;
    }
  },

  /**
   * Verifica se uma OP específica está pendente de envio ao servidor
   */
  isOrderPendingSync(opId: string, pendingIds: Set<string>): boolean {
    return pendingIds.has(opId);
  },
};
