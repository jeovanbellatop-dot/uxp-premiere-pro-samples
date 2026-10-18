import { getFirestoreDb, resetLiveMirror } from '../firebaseAdmin';
import { ServerAuditService } from '../auditService';

/**
 * Coleções protegidas pelo sistema que NUNCA podem ser apagadas sob nenhuma circunstância.
 * Atende estritamente a exigência de segurança e integridade do MES.
 */
export const FORBIDDEN_COLLECTIONS = new Set([
  'usuarios',
  'maquinas',
  'produtos',
  'clientes',
  'config',
  'setores',
  'processos',
  'regras-roteamento',
  'regras_roteamento',
  'etapas',
  'arquivos',
  'backups',
]);

export interface ClearHistoryOptions {
  auditoria?: boolean;
  alertas?: boolean;
  ops?: boolean;
  sessoesParadasUploads?: boolean;
}

export interface ClearHistoryDeletedCounts {
  auditoria: number;
  alertas: number;
  ops: number;
  sessoesMaquina: number;
  paradas: number;
  filaUploads: number;
  total: number;
}

export interface ClearHistoryResult {
  success: boolean;
  message: string;
  deletedCounts: ClearHistoryDeletedCounts;
}

/**
 * Apaga em lote (batch) até 250 documentos por transação no Firestore via Admin SDK.
 * Verifica estritamente a lista de coleções proibidas antes de iniciar.
 */
export async function deleteCollectionInBatches(
  db: FirebaseFirestore.Firestore,
  collectionName: string
): Promise<number> {
  const normalizedName = collectionName.trim();

  // Validação estrita de segurança contra deleções de coleções sensíveis
  if (FORBIDDEN_COLLECTIONS.has(normalizedName)) {
    throw new Error(
      `VIOLAÇÃO DE SEGURANÇA: A coleção '${normalizedName}' é protegida e NUNCA pode ser apagada.`
    );
  }

  let totalDeleted = 0;
  const colRef = db.collection(normalizedName);

  while (true) {
    const snapshot = await colRef.limit(200).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      // Se for a coleção de OPs, apaga também documentos da subcoleção 'etapas' vinculada à OP
      if (normalizedName === 'ops') {
        try {
          const subSnap = await doc.ref.collection('etapas').limit(100).get();
          for (const subDoc of subSnap.docs) {
            batch.delete(subDoc.ref);
          }
        } catch {
          // ignora falhas pontuais de leitura de subcoleção
        }
      }
      batch.delete(doc.ref);
    }

    await batch.commit();
    totalDeleted += snapshot.size;
  }

  return totalDeleted;
}

/**
 * Executa a rotina de limpeza de histórico selecionada pelo Administrador.
 */
export async function executeClearHistory(
  options: ClearHistoryOptions,
  userId: string,
  userName: string,
  userRole: string
): Promise<ClearHistoryResult> {
  const db = getFirestoreDb();
  const deletedCounts: ClearHistoryDeletedCounts = {
    auditoria: 0,
    alertas: 0,
    ops: 0,
    sessoesMaquina: 0,
    paradas: 0,
    filaUploads: 0,
    total: 0,
  };

  // (1) Histórico de logins e auditoria (coleção auditoria)
  if (options.auditoria) {
    deletedCounts.auditoria = await deleteCollectionInBatches(db, 'auditoria');
    resetLiveMirror('auditoria');
  }

  // (2) Alertas (coleção alertas)
  if (options.alertas) {
    deletedCounts.alertas = await deleteCollectionInBatches(db, 'alertas');
    resetLiveMirror('alertas');
  }

  // (3) Ordens de Produção de teste (coleção ops)
  if (options.ops) {
    deletedCounts.ops = await deleteCollectionInBatches(db, 'ops');
    resetLiveMirror('ops');
    resetLiveMirror('__etapas__');
  }

  // (4) Sessões de máquina, paradas e fila de uploads (sessoesMaquina, paradas, filaUploads) se existirem
  if (options.sessoesParadasUploads) {
    deletedCounts.sessoesMaquina = await deleteCollectionInBatches(db, 'sessoesMaquina');
    deletedCounts.paradas = await deleteCollectionInBatches(db, 'paradas');
    deletedCounts.filaUploads = await deleteCollectionInBatches(db, 'filaUploads');
    resetLiveMirror('sessoesMaquina');
    resetLiveMirror('paradas');
    resetLiveMirror('filaUploads');
  }

  deletedCounts.total =
    deletedCounts.auditoria +
    deletedCounts.alertas +
    deletedCounts.ops +
    deletedCounts.sessoesMaquina +
    deletedCounts.paradas +
    deletedCounts.filaUploads;

  // Registrar auditoria pós-limpeza como novo marco inicial
  try {
    ServerAuditService.log({
      action: 'ADMIN_CLEAR_HISTORY',
      entityType: 'CONFIG',
      entityId: 'clear_history',
      userId,
      userName,
      userRole,
      details: `Limpeza de histórico executada com sucesso por ${userName} (${userRole}). Total de ${deletedCounts.total} registros apagados [auditoria: ${deletedCounts.auditoria}, alertas: ${deletedCounts.alertas}, ops: ${deletedCounts.ops}, sessões/paradas/uploads: ${deletedCounts.sessoesMaquina + deletedCounts.paradas + deletedCounts.filaUploads}].`,
    });
  } catch (err) {
    console.error('[ClearHistory] Erro ao registrar log pós-limpeza:', err);
  }

  return {
    success: true,
    message: `Histórico do sistema limpo com sucesso. ${deletedCounts.total} registros apagados.`,
    deletedCounts,
  };
}
