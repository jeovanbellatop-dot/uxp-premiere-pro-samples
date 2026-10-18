import { initializeApp, getApps, cert } from 'firebase-admin/app';
import type { App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

/**
 * Inicialização única do Firebase Admin SDK usando GOOGLE_SERVICE_ACCOUNT_KEY.
 * Suporta string JSON pura ou codificada em Base64.
 * Exporta a instância única do Firestore para toda a aplicação backend.
 */
let adminApp: App | null = null;
let firestoreInstance: Firestore | null = null;

/** Chave colada com "\n" escrito (comum ao colar no painel da hospedagem) vira quebra de linha real. */
function normalizeServiceAccount(sa: Record<string, any>): Record<string, any> {
  if (typeof sa.private_key === 'string' && sa.private_key.includes('\\n')) {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }
  return sa;
}

function parseServiceAccount(): Record<string, any> | null {
  const sa = parseServiceAccountRaw();
  return sa ? normalizeServiceAccount(sa) : null;
}

function parseServiceAccountRaw(): Record<string, any> | null {
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
  if (!rawKey || !rawKey.trim()) {
    return null;
  }

  // Aspas em volta do valor inteiro (coladas junto no painel) atrapalham a leitura.
  const trimmed = rawKey.trim().replace(/^'([\s\S]*)'$/, '$1');

  // 1. JSON direto
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // continua para tentativa base64
    }
  }

  // 2. Base64
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf-8').trim();
    if (decoded.startsWith('{') && decoded.endsWith('}')) {
      return JSON.parse(decoded);
    }
  } catch {
    // fallback
  }

  return null;
}

export function getFirebaseAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  const apps = getApps();
  const existing = apps.find((app) => app?.name === 'bellatop-admin') || apps[0];
  if (existing) {
    adminApp = existing;
    return adminApp;
  }

  const serviceAccount = parseServiceAccount();
  if (!serviceAccount) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY não configurada ou inválida no ambiente para inicialização do Firebase Admin.'
    );
  }

  adminApp = initializeApp(
    {
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID,
    },
    'bellatop-admin'
  );

  return adminApp;
}

/** Nome do banco Firestore (FIRESTORE_DATABASE_ID). Vazio ou "(default)" = banco padrão. */
export function getFirestoreDatabaseId(): string | undefined {
  const id = (process.env.FIRESTORE_DATABASE_ID || '').trim();
  return id && id !== '(default)' ? id : undefined;
}

/** Explica em português, sem expor segredos, por que o Firestore falhou. */
export function explainFirestoreError(err: any): string {
  const msg = String(err?.message || err || '');
  const code = err?.code;
  if (/GOOGLE_SERVICE_ACCOUNT_KEY não configurada/i.test(msg)) {
    return process.env.GOOGLE_SERVICE_ACCOUNT_KEY
      ? 'A variável GOOGLE_SERVICE_ACCOUNT_KEY existe no Render, mas o valor não é um JSON de conta de serviço válido. Cole o conteúdo inteiro do arquivo .json baixado do Firebase (começa com { e termina com }).'
      : 'A variável GOOGLE_SERVICE_ACCOUNT_KEY não existe no Render. Crie-a em Environment com o conteúdo do arquivo .json da conta de serviço do Firebase.';
  }
  if (code === 5 || /NOT_FOUND/i.test(msg)) {
    return `O banco Firestore "${getFirestoreDatabaseId() || '(default)'}" não foi encontrado neste projeto. Se o seu banco tem outro nome (ID do banco no console do Firebase), defina FIRESTORE_DATABASE_ID no Render com esse nome; se não existe banco, crie o Firestore no console do Firebase.`;
  }
  if (code === 7 || /PERMISSION_DENIED/i.test(msg)) {
    if (/has not been used|is disabled/i.test(msg)) return 'A API do Cloud Firestore está desligada neste projeto. Ative-a no Google Cloud Console (APIs e serviços).';
    return 'A conta de serviço da chave não tem permissão no Firestore. No Google Cloud (IAM), dê a ela o papel "Cloud Datastore User" ou "Firebase Admin".';
  }
  if (code === 16 || /UNAUTHENTICATED|invalid_grant|invalid_signature|DECODER|PEM/i.test(msg)) {
    return 'A chave da conta de serviço foi recusada (excluída, revogada ou colada com erro). Gere uma nova chave no Firebase (Configurações do projeto → Contas de serviço) e cole o .json inteiro em GOOGLE_SERVICE_ACCOUNT_KEY.';
  }
  return 'Erro ao acessar o Firestore: ' + msg.slice(0, 200);
}

/** Diagnóstico público e seguro (sem segredos) da ligação com o Firestore. */
export async function diagnoseFirestore(): Promise<Record<string, any>> {
  const keyPresent = Boolean((process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').trim());
  const sa = parseServiceAccount();
  const base = {
    chaveConfigurada: keyPresent,
    chaveValida: Boolean(sa && sa.private_key && sa.client_email),
    projeto: sa?.project_id || process.env.FIREBASE_PROJECT_ID || null,
    banco: getFirestoreDatabaseId() || '(default)',
  };
  try {
    await getFirestoreDb().collection('usuarios').limit(1).get();
    return { ...base, status: 'CONECTADO', mensagem: 'Firestore acessível: o servidor consegue ler os usuários.' };
  } catch (err: any) {
    return { ...base, status: 'ERRO', codigo: err?.code ?? null, mensagem: explainFirestoreError(err) };
  }
}

export function getFirestoreDb(): Firestore {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  const app = getFirebaseAdminApp();
  // Projetos criados pelo AI Studio costumam usar um banco Firestore com nome próprio.
  const databaseId = getFirestoreDatabaseId();
  firestoreInstance = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  try {
    firestoreInstance.settings({ ignoreUndefinedProperties: true });
  } catch {
    // se já configurado
  }
  return firestoreInstance;
}

/**
/**
 * Retorna (ou inicializa) o bucket padrao do Firebase Storage, resolvendo
 * automaticamente a convencao de nome correta:
 * - FIREBASE_STORAGE_BUCKET, quando definido explicitamente no ambiente;
 * - <project_id>.firebasestorage.app (padrao para projetos criados a partir de 2024);
 * - <project_id>.appspot.com (padrao legado).
 * O resultado e cacheado em memoria apos a primeira resolucao bem-sucedida.
 */
let storageBucketInstance: ReturnType<ReturnType<typeof getStorage>['bucket']> | null = null;

export async function getStorageBucket() {
  if (storageBucketInstance) {
    return storageBucketInstance;
  }

  const app = getFirebaseAdminApp();
  const serviceAccount = parseServiceAccount();
  const projectId = (serviceAccount && serviceAccount.project_id) || process.env.FIREBASE_PROJECT_ID;

  const candidates: string[] = [];
  if (process.env.FIREBASE_STORAGE_BUCKET) {
    candidates.push(process.env.FIREBASE_STORAGE_BUCKET);
  }
  if (projectId) {
    candidates.push(`${projectId}.firebasestorage.app`);
    candidates.push(`${projectId}.appspot.com`);
  }

  const storage = getStorage(app);
  let lastError: any = null;

  for (const candidate of candidates) {
    try {
      const bucket = storage.bucket(candidate);
      const [exists] = await bucket.exists();
      if (exists) {
        storageBucketInstance = bucket;
        return storageBucketInstance;
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  const attempted = candidates.join(', ') || '(nenhum candidato - projectId ausente)';
  throw new Error(
    `Nenhum bucket do Firebase Storage encontrado. Tentativas: ${attempted}. ` +
      'Verifique se o Cloud Storage foi habilitado para este projeto Firebase, ou defina FIREBASE_STORAGE_BUCKET explicitamente.' +
      (lastError ? ` Ultimo erro: ${lastError.message}` : '')
  );
}

// =====================================================================
// ESPELHO VIVO EM MEMORIA (LISTENERS DO FIRESTORE)
// Dez ou mais aparelhos consultando a cada 5s multiplicam as leituras do
// Firestore e estouram a cota do plano gratuito em poucas horas. Com um
// listener por colecao o servidor mantem uma copia viva em memoria: os
// aparelhos leem dessa copia e o Firestore so cobra leitura quando algo
// realmente muda no banco.
// =====================================================================

type LiveMirror = {
  docs: Map<string, any>;
  ready: boolean;
  started: boolean;
};

const liveMirrors: Record<string, LiveMirror> = {};

function getMirror(key: string): LiveMirror {
  if (!liveMirrors[key]) {
    liveMirrors[key] = { docs: new Map(), ready: false, started: false };
  }
  return liveMirrors[key];
}

function startCollectionMirror(name: string): LiveMirror {
  const mirror = getMirror(name);
  if (mirror.started) return mirror;
  mirror.started = true;

  try {
    const firestore = getFirestoreDb();
    firestore.collection(name).onSnapshot(
      (snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type === 'removed') {
            mirror.docs.delete(change.doc.id);
          } else {
            mirror.docs.set(change.doc.id, change.doc.data());
          }
        }
        mirror.ready = true;
      },
      (err: any) => {
        console.error('[liveMirror] Listener da colecao ' + name + ' falhou:', err?.message || err);
        mirror.ready = false;
        mirror.started = false;
      }
    );
  } catch (err: any) {
    console.error('[liveMirror] Nao foi possivel iniciar o espelho de ' + name + ':', err?.message || err);
    mirror.started = false;
  }

  return mirror;
}

/** Lista viva da colecao. Devolve null enquanto o espelho nao estiver pronto. */
export function getLiveCollection(name: string): any[] | null {
  const mirror = startCollectionMirror(name);
  if (!mirror.ready) return null;
  return Array.from(mirror.docs.values());
}

const STEPS_MIRROR_KEY = '__etapas__';

function startStepsMirror(): LiveMirror {
  const mirror = getMirror(STEPS_MIRROR_KEY);
  if (mirror.started) return mirror;
  mirror.started = true;

  try {
    const firestore = getFirestoreDb();
    firestore.collectionGroup('etapas').onSnapshot(
      (snapshot) => {
        for (const change of snapshot.docChanges()) {
          const opId = change.doc.ref.parent.parent?.id;
          if (!opId) continue;
          const key = opId + '/' + change.doc.id;
          if (change.type === 'removed') {
            mirror.docs.delete(key);
          } else {
            mirror.docs.set(key, change.doc.data());
          }
        }
        mirror.ready = true;
      },
      (err: any) => {
        console.error('[liveMirror] Listener das etapas falhou:', err?.message || err);
        mirror.ready = false;
        mirror.started = false;
      }
    );
  } catch (err: any) {
    console.error('[liveMirror] Nao foi possivel iniciar o espelho de etapas:', err?.message || err);
    mirror.started = false;
  }

  return mirror;
}

/** Etapas vivas de uma OP, em ordem. Devolve null enquanto o espelho nao estiver pronto. */
export function getLiveSteps(opId: string): any[] | null {
  const mirror = startStepsMirror();
  if (!mirror.ready) return null;

  const prefix = opId + '/';
  const steps: any[] = [];
  mirror.docs.forEach((value, key) => {
    if (key.indexOf(prefix) === 0) steps.push(value);
  });
  steps.sort((a, b) => (a?.sequenceIndex || 0) - (b?.sequenceIndex || 0));
  return steps;
}

/** Sobe os espelhos junto com o servidor, antes do primeiro acesso. */
export function warmUpLiveMirrors(): void {
  startCollectionMirror('ops');
  startCollectionMirror('maquinas');
  startCollectionMirror('usuarios');
  startStepsMirror();
}

/** Limpa o cache em memória de um espelho vivo após deleção em lote */
export function resetLiveMirror(key: string): void {
  const mirror = liveMirrors[key];
  if (mirror) {
    mirror.docs.clear();
  }
}

export const db = {
  get instance(): Firestore {
    return getFirestoreDb();
  },
};
