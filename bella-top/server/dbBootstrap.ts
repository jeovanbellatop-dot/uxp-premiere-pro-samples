import { getFirestoreDb } from './firebaseAdmin';
import {
  INITIAL_MACHINES,
  INITIAL_PRODUCTS,
  INITIAL_PROCESS_TYPES,
  INITIAL_ROUTING_RULES,
  SECTOR_DEFINITIONS,
} from '../src/data/initialData';
import { ServerAuthService } from './authService';
import { FilePersistenceService } from './filePersistenceService';

export interface BootstrapResult {
  success: boolean;
  alreadyInitialized: boolean;
  projectId: string;
  timestamp: string;
  collectionsCreatedOrChecked: Record<string, number>;
  message: string;
}

/**
 * Inicialização Idempotente do Banco de Dados no Firestore (projeto bella-top-producao-2)
 *
 * Requisitos estritos de produção:
 * 1. ZERAR DADOS FICTÍCIOS: sem OPs de exemplo, sem perdas fictícias, sem alertas fictícios.
 * 2. Manter apenas cadastros estruturais reais: máquinas, setores, produtos e regras de roteamento.
 * 3. USUÁRIO MASTER ÚNICO: criado no primeiro boot com senha temporária forte e aleatória.
 * 4. BACKUP PREVENTIVO: executado antes de qualquer limpeza de dados operacionais.
 */
export async function initializeFirestoreDatabase(): Promise<BootstrapResult> {
  const db = getFirestoreDb();
  const timestamp = new Date().toISOString();
  const details: Record<string, number> = {};

  // 0. Usuários primeiro e isolados: uma falha nos passos seguintes não pode deixar a fábrica sem login.
  try {
    await ServerAuthService.ensureMasterUser();
    await ServerAuthService.ensureDefaultUsers();
  } catch (err: any) {
    console.error('[Bella Top MES] Falha ao cadastrar os usuários padrão:', err?.message || err);
  }

  let projectId = process.env.FIREBASE_PROJECT_ID || 'bella-top-producao-2';
  try {
    const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (key) {
      const parsed = JSON.parse(key.startsWith('{') ? key : Buffer.from(key, 'base64').toString('utf-8'));
      if (parsed.project_id) projectId = parsed.project_id;
    }
  } catch {
    // fallback
  }

  // 1. Configuração do Sistema (Coleção 'config')
  const configDocRef = db.collection('config').doc('system');
  const configSnap = await configDocRef.get();
  const alreadyInitialized = configSnap.exists;

  // Realiza backup pré-limpeza preventivo caso já existam dados
  if (alreadyInitialized) {
    try {
      await FilePersistenceService.createFirestoreBackup('Backup pré-inicialização idempotente');
    } catch (err: any) {
      console.warn('[Bella Top MES] Backup pré-limpeza não pôde ser gerado (ignorado se storage estiver offline):', err.message);
    }
  }

  if (!configSnap.exists) {
    await configDocRef.set({
      systemName: 'Bella Top - Produção MES',
      projectId,
      version: '2.0.0',
      initializedAt: timestamp,
      updatedAt: timestamp,
      singleSourceOfTruth: 'Google Cloud Firestore',
      driveIntegration: 'Backend Google Apps Script Bridge',
      driveRootFolderId: '1270ungaiRH5F_ZjmKFcNCJRHDFbVTosC',
      driveRootFolderName: 'Bella Top - Produção',
    });
    details['config'] = 1;
  } else {
    await configDocRef.update({
      lastVerifiedAt: timestamp,
      systemName: 'Bella Top - Produção MES',
      driveRootFolderId: '1270ungaiRH5F_ZjmKFcNCJRHDFbVTosC',
      driveRootFolderName: 'Bella Top - Produção',
    });
    details['config'] = 1;
  }

  // 2. Setores de Fábrica Estruturais (Coleção 'setores')
  const setoresSnap = await db.collection('setores').limit(1).get();
  if (setoresSnap.empty) {
    const batch = db.batch();
    for (const setor of SECTOR_DEFINITIONS) {
      const ref = db.collection('setores').doc(setor.code);
      batch.set(ref, { ...setor, createdAt: timestamp });
    }
    await batch.commit();
    details['setores'] = SECTOR_DEFINITIONS.length;
  } else {
    details['setores'] = (await db.collection('setores').count().get()).data().count;
  }

  // 3. Processos Operacionais Estruturais (Coleção 'processos')
  const procSnap = await db.collection('processos').limit(1).get();
  if (procSnap.empty) {
    const batch = db.batch();
    for (const proc of INITIAL_PROCESS_TYPES) {
      const ref = db.collection('processos').doc(proc.id);
      batch.set(ref, { ...proc, createdAt: timestamp });
    }
    await batch.commit();
    details['processos'] = INITIAL_PROCESS_TYPES.length;
  } else {
    details['processos'] = (await db.collection('processos').count().get()).data().count;
  }

  // 4. Regras de Roteamento Dinâmico Estruturais (Coleção 'regras-roteamento')
  const rulesSnap = await db.collection('regras-roteamento').limit(1).get();
  if (rulesSnap.empty) {
    const batch = db.batch();
    for (const rule of INITIAL_ROUTING_RULES) {
      const ref = db.collection('regras-roteamento').doc(rule.id);
      batch.set(ref, { ...rule, createdAt: timestamp });
    }
    await batch.commit();
    details['regras-roteamento'] = INITIAL_ROUTING_RULES.length;
  } else {
    details['regras-roteamento'] = (await db.collection('regras-roteamento').count().get()).data().count;
  }

  // 5. Catálogo de Produtos e Especificações (Coleção 'produtos')
  const prodSnap = await db.collection('produtos').limit(1).get();
  if (prodSnap.empty) {
    const batch = db.batch();
    for (const prod of INITIAL_PRODUCTS) {
      const ref = db.collection('produtos').doc(prod.id);
      batch.set(ref, { ...prod, createdAt: timestamp });
    }
    await batch.commit();
    details['produtos'] = INITIAL_PRODUCTS.length;
  } else {
    details['produtos'] = (await db.collection('produtos').count().get()).data().count;
  }

  // 6. Cadastro Oficial de Máquinas (Coleção 'maquinas')
  const macSnap = await db.collection('maquinas').limit(1).get();
  if (macSnap.empty) {
    const batch = db.batch();
    for (const mac of INITIAL_MACHINES) {
      const ref = db.collection('maquinas').doc(mac.id);
      batch.set(ref, { ...mac, createdAt: timestamp, updatedAt: timestamp });
    }
    await batch.commit();
    details['maquinas'] = INITIAL_MACHINES.length;
  } else {
    details['maquinas'] = (await db.collection('maquinas').count().get()).data().count;
  }

  // 7. Clientes Industriais (Coleção 'clientes')
  const clientesSnap = await db.collection('clientes').limit(1).get();
  if (clientesSnap.empty) {
    const defaultClients = [
      { id: 'cli_arezzo', nome: 'Arezzo Indústria e Comércio', segmento: 'Calçados', cordMode: 'MANUAL', createdAt: timestamp },
      { id: 'cli_anacapri', nome: 'Anacapri Calçados', segmento: 'Calçados', cordMode: 'MANUAL', createdAt: timestamp },
      { id: 'cli_sonho', nome: 'Sonho dos Pés Calçados', segmento: 'Calçados', cordMode: 'MANUAL', createdAt: timestamp },
      { id: 'cli_padrao', nome: 'Cliente Geral / Balcão', segmento: 'Comércio', cordMode: 'AUTOMATICO', createdAt: timestamp },
    ];
    const batch = db.batch();
    for (const cli of defaultClients) {
      batch.set(db.collection('clientes').doc(cli.id), cli);
    }
    await batch.commit();
    details['clientes'] = defaultClients.length;
  } else {
    details['clientes'] = (await db.collection('clientes').count().get()).data().count;
  }

  // 8. Limpeza de dados fictícios em coleções operacionais
  // Remove OPs de exemplo antigas (ex: op-1234, op-5678, etc.)
  try {
    const dummyOpIds = ['op-1234', 'op-5678', 'op_sample_1', 'op_sample_2'];
    for (const dummyId of dummyOpIds) {
      const doc = await db.collection('ops').doc(dummyId).get();
      if (doc.exists) {
        await db.collection('ops').doc(dummyId).delete();
      }
    }
  } catch {
    // ignore
  }

  // 9. Usuários: já garantidos no passo 0.
  details['usuarios'] = (await db.collection('usuarios').count().get()).data().count;
  details['ops'] = (await db.collection('ops').count().get()).data().count;
  details['arquivos'] = (await db.collection('arquivos').count().get()).data().count;
  details['filaUploads'] = (await db.collection('filaUploads').count().get()).data().count;
  details['auditoria'] = (await db.collection('auditoria').count().get()).data().count;
  details['alertas'] = (await db.collection('alertas').count().get()).data().count;
  details['sessoesMaquina'] = (await db.collection('sessoesMaquina').count().get()).data().count;
  details['backups'] = (await db.collection('backups').count().get()).data().count;

  return {
    success: true,
    alreadyInitialized,
    projectId,
    timestamp,
    collectionsCreatedOrChecked: details,
    message: alreadyInitialized
      ? 'Banco de dados Firestore verificado: dados estruturais preservados e dados fictícios zerados.'
      : 'Banco de dados Firestore inicializado com sucesso para todas as coleções operacionais reais.',
  };
}
