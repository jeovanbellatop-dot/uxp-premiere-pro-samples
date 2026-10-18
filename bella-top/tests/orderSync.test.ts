/**
 * tests/orderSync.test.ts
 * Suíte de testes de sincronização, fila de pendentes e recarga da OP.
 * AMBIENTE ISOLADO COM MOCKS - SEM GRAVAÇÃO REAL NO FIREBASE.
 */
import crypto from 'crypto';
import { createRequire } from 'module';

const req = createRequire(process.cwd() + '/package.json');
const firestoreCjs = req('firebase-admin/firestore');
const inMemoryStore = new Map<string, any>();

function getDocKey(col: string, id: string): string {
  return `${col}/${id}`;
}

const mockDb: any = {
  collection: (colName: string) => ({
    doc: (docId: string) => {
      const key = getDocKey(colName, docId);
      return {
        id: docId,
        ref: { id: docId, path: key },
        get: async () => {
          const data = inMemoryStore.get(key);
          return {
            exists: Boolean(data),
            id: docId,
            data: () => data,
          };
        },
        set: async (data: any) => {
          inMemoryStore.set(key, { ...data, id: docId });
        },
        update: async (patch: any) => {
          const current = inMemoryStore.get(key) || {};
          inMemoryStore.set(key, { ...current, ...patch });
        },
        delete: async () => {
          inMemoryStore.delete(key);
        },
        collection: (subCol: string) => ({
          get: async () => {
            const prefix = `${key}/${subCol}/`;
            const docs: any[] = [];
            for (const [k, v] of inMemoryStore.entries()) {
              if (k.startsWith(prefix)) {
                docs.push({ id: v.id, data: () => v, ref: { id: v.id, path: k } });
              }
            }
            return { docs, size: docs.length };
          },
          orderBy: () => ({
            get: async () => {
              const prefix = `${key}/${subCol}/`;
              const docs: any[] = [];
              for (const [k, v] of inMemoryStore.entries()) {
                if (k.startsWith(prefix)) {
                  docs.push({ id: v.id, data: () => v, ref: { id: v.id, path: k } });
                }
              }
              return { docs, size: docs.length };
            },
          }),
          doc: (subId: string) => {
            const subKey = `${key}/${subCol}/${subId}`;
            return {
              id: subId,
              get: async () => ({
                exists: inMemoryStore.has(subKey),
                id: subId,
                data: () => inMemoryStore.get(subKey),
              }),
              set: async (data: any) => {
                inMemoryStore.set(subKey, { ...data, id: subId });
              },
              delete: async () => {
                inMemoryStore.delete(subKey);
              },
            };
          },
        }),
      };
    },
    get: async () => {
      const prefix = `${colName}/`;
      const docs: any[] = [];
      for (const [k, v] of inMemoryStore.entries()) {
        if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
          docs.push({ id: v.id, data: () => v });
        }
      }
      return { docs, size: docs.length };
    },
  }),
  runTransaction: async (updateFunction: any) => {
    const tx = {
      get: async (refOrQuery: any) => {
        if (typeof refOrQuery.get === 'function') {
          return refOrQuery.get();
        }
        return { exists: false, data: () => undefined };
      },
      set: (docRef: any, data: any) => {
        inMemoryStore.set(docRef.path || `ops/${docRef.id}`, data);
      },
      update: (docRef: any, data: any) => {
        const key = docRef.path || `ops/${docRef.id}`;
        const current = inMemoryStore.get(key) || {};
        inMemoryStore.set(key, { ...current, ...data });
      },
      delete: (docRef: any) => {
        inMemoryStore.delete(docRef.path || `ops/${docRef.id}`);
      },
    };
    return updateFunction(tx);
  },
};

firestoreCjs.getFirestore = () => mockDb;

class MockLocalStorage {
  private store: Map<string, string> = new Map();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m',
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ${colors.green}✓${colors.reset} ${testName}`);
    passed++;
  } else {
    console.error(`  ${colors.red}✗${colors.reset} ${colors.bold}${testName}${colors.reset}`);
    if (detail) console.error(`    ${colors.yellow}Detalhe: ${detail}${colors.reset}`);
    failed++;
  }
}

async function runSyncTests() {
  console.log(`\n${colors.cyan}${colors.bold}=== TESTES DE SINCRONIZAÇÃO E PERSISTÊNCIA DA OP ===${colors.reset}\n`);

  const mockStorage = new MockLocalStorage();
  (global as any).localStorage = mockStorage;

  const { mesStore } = await import('../src/services/mesStore');
  const { opsRepository } = await import('../server/repositories/opsRepository');
  const store = mesStore as any;

  // 1. Criação de OP com miniatura compacta e inclusão em pendingOrderPushIds
  console.log(`${colors.bold}1. Fila de envio e salvamento com miniatura compacta${colors.reset}`);
  const opId = 'op_sync_test_01';
  const testOp: any = {
    id: opId,
    opNumber: '2502.1',
    orderNumber: 'PED-2502',
    client: 'Cliente Bella Top',
    productName: 'Sacola Alça Fita 35x40',
    targetQuantity: 5000,
    currentGoodQuantity: 0,
    totalLosses: 0,
    unit: 'UNIDADES',
    material: 'TNT',
    grammage: 80,
    color: 'Branco',
    productThumbnail: 'data:image/jpeg;base64,' + 'T'.repeat(25 * 1024), // ~25 KB
    layoutPreviewImage: 'data:image/jpeg;base64,' + 'L'.repeat(45 * 1024), // ~45 KB
    priority: 'VERDE',
    status: 'PROGRAMADA',
    currentStepIndex: 0,
    steps: [
      { id: 'step_1', processName: 'Refile', status: 'PRONTA', sequenceIndex: 0, plannedQuantity: 5000, receivedQuantity: 5000, producedQuantity: 0, lossQuantity: 0, goodQuantity: 0, unit: 'UNIDADES' },
    ],
    createdAt: new Date().toISOString(),
    createdBy: 'PCP',
    deadline: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
  };

  store.orders = [testOp];
  store.pendingOrderPushIds.add(opId);
  store.orderBaseVersions.set(opId, '');
  store.saveToStorage();

  assert(store.pendingOrderPushIds.has(opId), 'OP marcada como pendente em pendingOrderPushIds');
  const storedOrders = JSON.parse(mockStorage.getItem('bellatop_orders_v2') || '[]');
  assert(storedOrders.length > 0, 'OP salva em bellatop_orders_v2');
  assert(
    Boolean(storedOrders[0].productThumbnail),
    'Miniatura data URL compacta preservada no localStorage após saveToStorage'
  );

  // 2. Sobrevivência à recarga (loadFromStorage)
  console.log(`\n${colors.bold}2. Preservação após recarga da página${colors.reset}`);
  const reloadedStore = new (mesStore.constructor as any)();
  const reloadedOp = reloadedStore.orders.find((o: any) => o.id === opId);

  assert(Boolean(reloadedOp), 'OP recarregada do storage com sucesso');
  assert(
    Boolean(reloadedOp?.productThumbnail),
    'Miniatura da sacola permanece disponível após recarga'
  );
  assert(
    reloadedStore.pendingOrderPushIds.has(opId),
    'OP permanece pendente de sincronização após recarga'
  );

  // 3. Falha de envio mantém a OP pendente
  console.log(`\n${colors.bold}3. Falha de gravação remota mantém OP pendente${colors.reset}`);
  (global as any).window = {};
  (global as any).fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: 'Servidor temporariamente indisponível' }),
  });

  store.authSessionToken = 'bt_sess_' + crypto.randomBytes(24).toString('hex') + '_' + Date.now();
  store.syncOrdersToBackend();
  await new Promise((r) => setTimeout(r, 2200));

  assert(store.pendingOrderPushIds.has(opId), 'OP permanece na fila de pendentes após falha HTTP');
  assert(
    Boolean(store.lastOrdersSyncError),
    'Erro de sincronização registrado e visível para o usuário'
  );

  delete (global as any).fetch;
  delete (global as any).window;

  // 4. Concorrência: escrita com versão base desatualizada retorna STALE_WRITE
  console.log(`\n${colors.bold}4. Concorrência e STALE_WRITE${colors.reset}`);
  const initialStamp = '2026-10-15T12:00:00.000Z';
  inMemoryStore.set(`ops/${opId}`, {
    id: opId,
    opNumber: '2502.1',
    updatedAt: initialStamp,
  });
  inMemoryStore.set(`ops/${opId}/etapas/step_1`, {
    id: 'step_1',
    status: 'PRONTA',
    sequenceIndex: 0,
  });

  const payloadA: any = {
    id: opId,
    opNumber: '2502.1',
    _baseUpdatedAt: initialStamp,
    steps: [{ id: 'step_1', status: 'PRODUZINDO', sequenceIndex: 0 }],
  };
  const savedA = await opsRepository.createOp(payloadA);
  assert(Boolean(savedA), 'Primeira escrita concorrente gravada com sucesso');

  const payloadB: any = {
    id: opId,
    opNumber: '2502.1',
    _baseUpdatedAt: initialStamp, // Versão defasada
    steps: [{ id: 'step_1', status: 'PAUSADA', sequenceIndex: 0 }],
  };

  let staleError: any = null;
  try {
    await opsRepository.createOp(payloadB);
  } catch (err: any) {
    staleError = err;
  }
  assert(
    staleError !== null && staleError.code === 'STALE_WRITE',
    'Escrita concorrente rejeitada com STALE_WRITE devido a versão defasada'
  );

  console.log(`\n${colors.bold}=== RESULTADO DOS TESTES DE SINCRONIZAÇÃO ===${colors.reset}`);
  console.log(`Total executados: ${passed + failed}`);
  console.log(`Aprovados: ${colors.green}${passed}${colors.reset}`);
  console.log(`Falhas: ${failed > 0 ? colors.red : colors.green}${failed}${colors.reset}\n`);

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runSyncTests().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
