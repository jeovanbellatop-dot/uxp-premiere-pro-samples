/**
 * Sobe o servidor real (server.ts) com um Firestore simulado em memória, sem rede e sem chave.
 * Serve para testar o app inteiro no navegador sem tocar no banco da fábrica.
 * Os dados somem quando o processo termina.
 *
 * Uso: npm run build && NODE_ENV=production PORT=3100 BELLATOP_OPEN_ACCESS=1 npx tsx scripts/devServerMemory.ts
 */
import '../tests/offlineFirebaseKey';
import { createRequire } from 'module';

const req = createRequire(import.meta.url);
const firestoreModule = req('firebase-admin/firestore');

const store = new Map<string, any>();
const clone = (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const snapOf = (path: string, data: any): any => {
  const id = path.split('/').pop()!;
  return { id, exists: data !== undefined, data: () => clone(data), ref: docRef(path) };
};

function docRef(path: string): any {
  const id = path.split('/').pop()!;
  return {
    id,
    path,
    get: async () => snapOf(path, store.get(path)),
    set: async (d: any, opt?: any) => {
      store.set(path, opt?.merge ? { ...(store.get(path) || {}), ...clone(d) } : clone(d));
    },
    update: async (d: any) => {
      store.set(path, { ...(store.get(path) || {}), ...clone(d) });
    },
    delete: async () => {
      store.delete(path);
    },
    collection: (c: string) => colRef(`${path}/${c}`),
    onSnapshot: () => () => {},
  };
}

type Filter = [string, string, any];
const matches = (data: any, [field, op, value]: Filter) => {
  const v = data?.[field];
  switch (op) {
    case '==': return v === value;
    case '!=': return v !== value;
    case '<': return v < value;
    case '<=': return v <= value;
    case '>': return v > value;
    case '>=': return v >= value;
    case 'in': return Array.isArray(value) && value.includes(v);
    case 'array-contains': return Array.isArray(v) && v.includes(value);
    default: return true;
  }
};

function queryOf(select: () => Array<[string, any]>, filters: Filter[] = [], limit = 0, order?: [string, string]): any {
  const run = async () => {
    let rows = select().filter(([, v]) => filters.every((f) => matches(v, f)));
    if (order) {
      const [field, dir] = order;
      rows = rows.sort((a, b) => (a[1]?.[field] > b[1]?.[field] ? 1 : -1) * (dir === 'desc' ? -1 : 1));
    }
    if (limit) rows = rows.slice(0, limit);
    const docs = rows.map(([k, v]) => snapOf(k, v));
    return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn: any) => docs.forEach(fn) };
  };
  return {
    where: (f: string, op: string, v: any) => queryOf(select, [...filters, [f, op, v]], limit, order),
    orderBy: (f: string, dir = 'asc') => queryOf(select, filters, limit, [f, dir]),
    limit: (n: number) => queryOf(select, filters, n, order),
    get: run,
    count: () => ({
      get: async () => {
        const n = (await run()).size;
        return { data: () => ({ count: n }) };
      },
    }),
    onSnapshot: () => () => {},
  };
}

function colRef(path: string): any {
  const select = () =>
    [...store.entries()].filter(([k]) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/'));
  return {
    id: path.split('/').pop(),
    path,
    doc: (id?: string) => docRef(`${path}/${id || Math.random().toString(36).slice(2)}`),
    add: async (d: any) => {
      const r = docRef(`${path}/${Math.random().toString(36).slice(2)}`);
      await r.set(d);
      return r;
    },
    ...queryOf(select),
  };
}

const db: any = {
  collection: (c: string) => colRef(c),
  collectionGroup: (name: string) =>
    queryOf(() => [...store.entries()].filter(([k]) => k.split('/').slice(-2, -1)[0] === name)),
  doc: (p: string) => docRef(p),
  settings: () => {},
  batch: () => {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (r: any, d: any, o?: any) => ops.push(() => r.set(d, o)),
      update: (r: any, d: any) => ops.push(() => r.update(d)),
      delete: (r: any) => ops.push(() => r.delete()),
      commit: async () => {
        for (const o of ops) await o();
      },
    };
  },
  runTransaction: async (fn: any) =>
    fn({
      get: (r: any) => r.get(),
      set: (r: any, d: any, o?: any) => r.set(d, o),
      update: (r: any, d: any) => r.update(d),
      delete: (r: any) => r.delete(),
    }),
};

firestoreModule.getFirestore = () => db;

(async () => {
  await import('../server');
})();
