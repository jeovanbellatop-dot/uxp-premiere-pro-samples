import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { getFirestoreDb, getStorageBucket } from './firebaseAdmin';
import {
  DriveBridge,
  DriveBridgeUploadResult,
  CATEGORY_SUBFOLDER_MAP,
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  DEFAULT_DRIVE_ROOT_NAME,
} from './driveBridge';

export const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024; // 1 GB por arquivo/OP

export const BLOCKED_MIME_PATTERNS = [
  'application/x-msdownload',
  'application/x-sh',
  'application/x-bat',
  'application/x-csh',
  'application/x-executable',
];

export const BLOCKED_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.php',
  '.vbs',
  '.scr',
  '.msi',
  '.com',
];

export interface FileMetadata {
  id: string; // fileId único
  fileId?: string; // alias
  opId: string;
  opNumero: string;
  nome: string;
  fileName?: string; // alias
  mimeType: string;
  tamanho: number;
  size?: number; // alias
  categoria: string;
  origem: string;
  destinoAtual: 'DRIVE' | 'FIREBASE_STORAGE';
  driveFileId: string | null;
  driveFolderId: string | null;
  storagePath: string | null;
  status: 'PENDENTE' | 'ENVIADO' | 'PENDENTE_DRIVE' | 'FALHA';
  tentativas: number;
  attempts?: number; // alias
  maxAttempts: number; // 3
  ultimoErro: string | null;
  errorReason?: string | null; // alias
  criadoEm: string;
  atualizadoEm: string;
  enviadoPor: string;
  setor: string;
  etapa?: string;
  publicUrl: string;
  descricao?: string;
}

export interface SaveFileInput {
  opNumero?: string;
  opId?: string;
  categoria?: string;
  fileName?: string;
  nome?: string;
  mimeType?: string;
  buffer?: Buffer;
  base64?: string;
  dataUrl?: string;
  descricao?: string;
  enviadoPor?: string;
  setor?: string;
  etapa?: string;
  origem?: string;
}

export interface BackupRecord {
  id: string;
  data: string;
  status: 'CONCLUIDO_DRIVE' | 'PENDENTE_DRIVE' | 'FALHA';
  tamanho: number;
  driveFileId: string | null;
  storagePath: string | null;
  erro: string | null;
  criadoPor: string;
  collectionsIncluded: string[];
}

interface MemoryCacheEntry {
  buffer: Buffer;
  mimeType: string;
  cachedAt: number;
}

export class FilePersistenceService {
  private static binaryCache = new Map<string, MemoryCacheEntry>();
  private static isReprocessing = false;
  private static queueTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Sanitiza nomes de arquivos para evitar caracteres inválidos
   */
  public static sanitizeFileName(name: string): string {
    return (name || 'arquivo')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-120);
  }

  /**
   * Valida restrições de tamanho (máx 1 GB) e extensões executáveis
   */
  public static validateFile(fileName: string, mimeType: string, size: number): void {
    if (size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `Arquivo excede o limite máximo permitido de 1 GB (${(size / (1024 * 1024)).toFixed(2)} MB fornecido).`
      );
    }

    const lowerName = (fileName || '').toLowerCase();
    for (const ext of BLOCKED_EXTENSIONS) {
      if (lowerName.endsWith(ext)) {
        throw new Error(`Tipo de arquivo não permitido por motivos de segurança: extensão ${ext}`);
      }
    }

    const lowerMime = (mimeType || '').toLowerCase();
    for (const pattern of BLOCKED_MIME_PATTERNS) {
      if (lowerMime === pattern) {
        throw new Error(`MIME type não permitido por segurança: ${mimeType}`);
      }
    }
  }

  /**
   * Extrai Buffer e MimeType de dataUrl ou base64
   */
  public static resolveBufferAndMime(input: SaveFileInput): { buffer: Buffer; mimeType: string; base64: string } {
    let buffer: Buffer;
    let mimeType = input.mimeType || 'application/octet-stream';
    let base64 = input.base64 || '';

    if (input.buffer) {
      buffer = input.buffer;
      if (!base64) base64 = buffer.toString('base64');
    } else if (input.dataUrl) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(input.dataUrl);
      if (match) {
        mimeType = input.mimeType || match[1];
        base64 = match[2];
        buffer = Buffer.from(base64, 'base64');
      } else {
        base64 = input.dataUrl.replace(/^data:[^;]+;base64,/, '');
        buffer = Buffer.from(base64, 'base64');
      }
    } else if (base64) {
      buffer = Buffer.from(base64, 'base64');
    } else {
      throw new Error('Nenhum dado binário fornecido (buffer, dataUrl ou base64 obrigatório).');
    }

    return { buffer, mimeType, base64 };
  }

  /**
   * Salva binário no Firebase Storage (com fallback de disco local se storage bucket não estiver provisionado)
   * NUNCA salva base64 no Firestore ou no localStorage.
   */
  private static async saveBinaryToStorage(
    fileId: string,
    fileName: string,
    opNumero: string,
    mimeType: string,
    buffer: Buffer
  ): Promise<string> {
    const objectPath = `arquivos/${opNumero}/${fileId}_${this.sanitizeFileName(fileName)}`;

    try {
      const bucket = await getStorageBucket();
      const fileRef = bucket.file(objectPath);
      await fileRef.save(buffer, {
        metadata: { contentType: mimeType },
        resumable: false,
      });
      return objectPath;
    } catch (storageErr: any) {
      // Fallback seguro em disco do servidor (nunca no Firestore)
      const localDir = path.join(process.cwd(), 'server', 'storage_cache', opNumero);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      const localFilePath = path.join(localDir, `${fileId}_${this.sanitizeFileName(fileName)}`);
      fs.writeFileSync(localFilePath, buffer);
      return `local://${localFilePath}`;
    }
  }

  /**
   * Lê binário do Firebase Storage ou fallback de disco local
   */
  private static async readBinaryFromStorage(storagePath: string): Promise<Buffer | null> {
    if (!storagePath) return null;

    if (storagePath.startsWith('local://')) {
      const localPath = storagePath.replace('local://', '');
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath);
      }
      return null;
    }

    try {
      const bucket = await getStorageBucket();
      const fileRef = bucket.file(storagePath);
      const [downloaded] = await fileRef.download();
      return downloaded;
    } catch {
      return null;
    }
  }

  /**
   * Salva o arquivo de forma resiliente:
   * 1. Valida tamanho (máx 1 GB) e MIME type
   * 2. Registra metadados no Firestore com status PENDENTE
   * 3. Salva binário no Firebase Storage
   * 4. Tenta enviar para o Google Drive pelo backend
   * 5. Se OK: atualiza Firestore com driveFileId, destinoAtual: DRIVE, status: ENVIADO
   * 6. Se falhar: mantém no Firebase Storage, destinoAtual: FIREBASE_STORAGE, status: PENDENTE_DRIVE
   * 7. Registra na filaUploads para reprocessamento automático
   */
  public static async saveAndUploadFile(input: SaveFileInput): Promise<{
    success: boolean;
    file: FileMetadata;
    url: string;
    warning?: string;
  }> {
    const { buffer, mimeType, base64 } = this.resolveBufferAndMime(input);
    const fileName = this.sanitizeFileName(input.nome || input.fileName || `arquivo_${Date.now()}`);
    const size = buffer.length;

    // 1. Validação estrita de tamanho e extensão
    this.validateFile(fileName, mimeType, size);

    const opNumero = input.opNumero || 'GERAL';
    const opId = input.opId || opNumero;
    const categoria = input.categoria || 'Documentos';
    const origem = input.origem || 'PCP';
    const enviadoPor = input.enviadoPor || 'Sistema MES';
    const setor = input.setor || 'PCP';
    const etapa = input.etapa;
    const nowIso = new Date().toISOString();
    const fileId = `file_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const publicUrl = `/api/files/${fileId}`;

    // Guarda em cache de memória imediatamente para respostas rápidas
    this.binaryCache.set(fileId, {
      buffer,
      mimeType,
      cachedAt: Date.now(),
    });

    const db = getFirestoreDb();

    // 2. Criação do registro inicial no Firestore (apenas metadados, ZERO base64)
    const initialRecord: FileMetadata = {
      id: fileId,
      fileId,
      opId,
      opNumero,
      nome: fileName,
      fileName,
      mimeType,
      tamanho: size,
      size,
      categoria,
      origem,
      destinoAtual: 'FIREBASE_STORAGE',
      driveFileId: null,
      driveFolderId: null,
      storagePath: null,
      status: 'PENDENTE',
      tentativas: 0,
      attempts: 0,
      maxAttempts: 3,
      ultimoErro: null,
      errorReason: null,
      criadoEm: nowIso,
      atualizadoEm: nowIso,
      enviadoPor,
      setor,
      etapa: etapa || null,
      publicUrl,
      descricao: input.descricao || '',
    };

    try {
      await db.collection('arquivos').doc(fileId).set(initialRecord);
    } catch (err: any) {
      console.warn('[FilePersistence] Aviso ao criar doc inicial no Firestore:', err.message);
    }

    // 3. Salva o binário no Firebase Storage
    const storagePath = await this.saveBinaryToStorage(fileId, fileName, opNumero, mimeType, buffer);
    initialRecord.storagePath = storagePath;

    // 4. Tenta envio ao Google Drive exclusivamente pelo backend
    let driveUploadSucceeded = false;
    let driveFileId: string | null = null;
    let driveFolderId: string | null = null;
    let driveErrorReason: string | null = null;

    if (DriveBridge.isConfigured()) {
      try {
        const driveRes: DriveBridgeUploadResult = await DriveBridge.uploadFile({
          opNumero,
          dataCadastro: nowIso,
          categoria,
          fileName,
          mimeType,
          base64,
          descricao: input.descricao,
          fileId,
        });

        if (driveRes && driveRes.ok && driveRes.file) {
          driveUploadSucceeded = true;
          driveFileId = driveRes.file.id;
          driveFolderId = driveRes.folderId || null;
        } else {
          driveErrorReason = driveRes.error || 'Ponte do Drive retornou ok: false';
        }
      } catch (err: any) {
        driveErrorReason = err.message || 'Falha ao conectar com o Google Drive Bridge';
      }
    } else {
      driveErrorReason = 'DRIVE_BRIDGE_URL ou DRIVE_BRIDGE_TOKEN não configurados no ambiente';
    }

    // 5. Atualização do registro com o resultado
    const finalRecord: FileMetadata = {
      ...initialRecord,
      driveFileId,
      driveFolderId,
      storagePath,
      destinoAtual: driveUploadSucceeded ? 'DRIVE' : 'FIREBASE_STORAGE',
      status: driveUploadSucceeded ? 'ENVIADO' : 'PENDENTE_DRIVE',
      tentativas: 1,
      attempts: 1,
      ultimoErro: driveUploadSucceeded ? null : driveErrorReason,
      errorReason: driveUploadSucceeded ? null : driveErrorReason,
      atualizadoEm: new Date().toISOString(),
    };

    // Grava metadados definitivos em 'arquivos'
    try {
      await db.collection('arquivos').doc(fileId).set(finalRecord);

      // Se falhou envio ao Drive, enfileira em 'filaUploads' para reprocessamento
      if (!driveUploadSucceeded) {
        await db.collection('filaUploads').doc(fileId).set({
          fileId,
          opNumero,
          storagePath,
          mimeType,
          nome: fileName,
          categoria,
          tentativas: 1,
          maxAttempts: 3,
          ultimoErro: driveErrorReason,
          criadoEm: nowIso,
          atualizadoEm: nowIso,
          proximaTentativaEm: new Date(Date.now() + 30000).toISOString(), // 30s backoff
        });
      }
    } catch (dbErr: any) {
      console.error('[FilePersistence] Erro ao gravar metadados no Firestore:', dbErr.message);
    }

    return {
      success: true,
      file: finalRecord,
      url: publicUrl,
      warning: driveUploadSucceeded
        ? undefined
        : `Arquivo salvo com segurança no Firebase Storage. Pendente de sincronização com o Google Drive: ${driveErrorReason}`,
    };
  }

  /**
   * Recupera o arquivo binário (Buffer e MimeType) por fileId:
   * 1. Cache em memória (instantâneo)
   * 2. Se já estiver no Google Drive, busca pelo Drive Bridge
   * 3. Se estiver no Firebase Storage, lê do bucket
   */
  public static async getFileBinary(
    fileId: string
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
    // 1. Cache em memória
    const cached = this.binaryCache.get(fileId);
    if (cached && Date.now() - cached.cachedAt < 30 * 60 * 1000) {
      return {
        buffer: cached.buffer,
        mimeType: cached.mimeType,
        fileName: `${fileId}`,
      };
    }

    // 2. Consulta metadados no Firestore
    const db = getFirestoreDb();
    const docSnap = await db.collection('arquivos').doc(fileId).get();
    if (!docSnap.exists) {
      return null;
    }

    const record = docSnap.data() as FileMetadata;
    let resolvedBuffer: Buffer | null = null;

    // A. Se sincronizado no Drive
    if (record.driveFileId && DriveBridge.isConfigured()) {
      try {
        const driveData = await DriveBridge.getFile(record.driveFileId);
        if (driveData && driveData.base64) {
          resolvedBuffer = Buffer.from(driveData.base64, 'base64');
        }
      } catch (err: any) {
        console.warn(`[FilePersistence] Falha ao recuperar arquivo do Drive (${record.driveFileId}):`, err.message);
      }
    }

    // B. Se no Firebase Storage
    if (!resolvedBuffer && record.storagePath) {
      resolvedBuffer = await this.readBinaryFromStorage(record.storagePath);
    }

    if (!resolvedBuffer) {
      return null;
    }

    // Alimenta cache de memória
    this.binaryCache.set(fileId, {
      buffer: resolvedBuffer,
      mimeType: record.mimeType,
      cachedAt: Date.now(),
    });

    return {
      buffer: resolvedBuffer,
      mimeType: record.mimeType || 'application/octet-stream',
      fileName: record.nome || record.fileName || `${fileId}`,
    };
  }

  /**
   * Lista arquivos de uma OP
   */
  public static async listFilesForOp(opIdOrNumero: string): Promise<FileMetadata[]> {
    const db = getFirestoreDb();
    const results: FileMetadata[] = [];

    try {
      const snap1 = await db.collection('arquivos').where('opNumero', '==', opIdOrNumero).get();
      snap1.forEach((d) => results.push(d.data() as FileMetadata));

      if (results.length === 0) {
        const snap2 = await db.collection('arquivos').where('opId', '==', opIdOrNumero).get();
        snap2.forEach((d) => results.push(d.data() as FileMetadata));
      }
    } catch (err: any) {
      console.error('[FilePersistence] Erro ao listar arquivos da OP:', err);
    }

    return results;
  }

  /**
   * Exclui / move para lixeira arquivo
   */
  public static async deleteFile(fileId: string): Promise<{ success: boolean; error?: string }> {
    const db = getFirestoreDb();
    const docRef = db.collection('arquivos').doc(fileId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return { success: false, error: 'Arquivo não encontrado.' };
    }

    const record = snap.data() as FileMetadata;

    // Se tiver no Drive, joga na lixeira
    if (record.driveFileId && DriveBridge.isConfigured()) {
      try {
        await DriveBridge.trashFile(record.driveFileId);
      } catch {
        // silêncio
      }
    }

    // Se tiver no Storage, apaga
    if (record.storagePath && !record.storagePath.startsWith('local://')) {
      try {
        const bucket = await getStorageBucket();
        await bucket.file(record.storagePath).delete({ ignoreNotFound: true });
      } catch {
        // silêncio
      }
    } else if (record.storagePath && record.storagePath.startsWith('local://')) {
      try {
        fs.unlinkSync(record.storagePath.replace('local://', ''));
      } catch {
        // silêncio
      }
    }

    // Remove da fila de pendentes
    try {
      await db.collection('filaUploads').doc(fileId).delete();
    } catch {
      // silêncio
    }

    // Remove do cache de memória
    this.binaryCache.delete(fileId);

    // Remove do Firestore
    await docRef.delete();

    return { success: true };
  }

  /**
   * Reprocessa a fila de arquivos pendentes de sincronização com o Google Drive
   * - Até 3 tentativas automáticas com backoff
   * - Idempotente: não duplica arquivos
   */
  public static async reprocessPendingDriveQueue(): Promise<{
    processed: number;
    successCount: number;
    failedCount: number;
  }> {
    if (this.isReprocessing) {
      return { processed: 0, successCount: 0, failedCount: 0 };
    }

    if (!DriveBridge.isConfigured()) {
      return { processed: 0, successCount: 0, failedCount: 0 };
    }

    this.isReprocessing = true;
    let successCount = 0;
    let failedCount = 0;
    let processed = 0;

    try {
      const db = getFirestoreDb();
      const snapshot = await db
        .collection('filaUploads')
        .limit(20)
        .get();

      if (snapshot.empty) {
        this.isReprocessing = false;
        return { processed: 0, successCount: 0, failedCount: 0 };
      }

      const now = Date.now();

      for (const queueDoc of snapshot.docs) {
        const item = queueDoc.data();
        const fileId = item.fileId || queueDoc.id;

        // Verifica backoff
        if (item.proximaTentativaEm && new Date(item.proximaTentativaEm).getTime() > now) {
          continue; // Ainda no tempo de espera do backoff
        }

        const fileDocRef = db.collection('arquivos').doc(fileId);
        const fileDocSnap = await fileDocRef.get();
        if (!fileDocSnap.exists) {
          await queueDoc.ref.delete();
          continue;
        }

        const record = fileDocSnap.data() as FileMetadata;

        // Idempotência: se já tiver driveFileId, apenas finaliza
        if (record.driveFileId) {
          await fileDocRef.update({
            status: 'ENVIADO',
            destinoAtual: 'DRIVE',
            atualizadoEm: new Date().toISOString(),
          });
          await queueDoc.ref.delete();
          successCount++;
          processed++;
          continue;
        }

        const currentAttempts = (record.tentativas || record.attempts || 1);
        if (currentAttempts >= 3) {
          // Atingiu limite de 3 tentativas
          await fileDocRef.update({
            status: 'FALHA',
            atualizadoEm: new Date().toISOString(),
          });
          await queueDoc.ref.delete();
          failedCount++;
          processed++;
          continue;
        }

        // Recupera o binário do Storage
        const fileBinary = await this.getFileBinary(fileId);
        if (!fileBinary) {
          const nextAttempts = currentAttempts + 1;
          await fileDocRef.update({
            tentativas: nextAttempts,
            attempts: nextAttempts,
            status: nextAttempts >= 3 ? 'FALHA' : 'PENDENTE_DRIVE',
            ultimoErro: 'Binário não encontrado para reprocessamento.',
            errorReason: 'Binário não encontrado para reprocessamento.',
            atualizadoEm: new Date().toISOString(),
          });
          if (nextAttempts >= 3) {
            await queueDoc.ref.delete();
          } else {
            await queueDoc.ref.update({
              tentativas: nextAttempts,
              proximaTentativaEm: new Date(Date.now() + nextAttempts * 60000).toISOString(),
            });
          }
          failedCount++;
          processed++;
          continue;
        }

        try {
          const uploadRes = await DriveBridge.uploadFile({
            opNumero: record.opNumero,
            categoria: record.categoria,
            fileName: record.nome || record.fileName || `arquivo_${fileId}`,
            mimeType: record.mimeType,
            base64: fileBinary.buffer.toString('base64'),
            descricao: record.descricao,
            fileId,
          });

          if (uploadRes && uploadRes.ok && uploadRes.file) {
            await fileDocRef.update({
              status: 'ENVIADO',
              destinoAtual: 'DRIVE',
              driveFileId: uploadRes.file.id,
              driveFolderId: uploadRes.folderId || null,
              ultimoErro: null,
              errorReason: null,
              tentativas: currentAttempts + 1,
              attempts: currentAttempts + 1,
              atualizadoEm: new Date().toISOString(),
            });
            await queueDoc.ref.delete();
            successCount++;
          } else {
            throw new Error(uploadRes.error || 'Falha na resposta do Google Drive');
          }
        } catch (err: any) {
          const nextAttempts = currentAttempts + 1;
          const isFinal = nextAttempts >= 3;
          await fileDocRef.update({
            tentativas: nextAttempts,
            attempts: nextAttempts,
            status: isFinal ? 'FALHA' : 'PENDENTE_DRIVE',
            ultimoErro: `Tentativa ${nextAttempts}/3 falhou: ${err.message}`,
            errorReason: `Tentativa ${nextAttempts}/3 falhou: ${err.message}`,
            atualizadoEm: new Date().toISOString(),
          });

          if (isFinal) {
            await queueDoc.ref.delete();
          } else {
            // Backoff exponencial: 30s, 2min
            const backoffMs = nextAttempts === 2 ? 30000 : 120000;
            await queueDoc.ref.update({
              tentativas: nextAttempts,
              ultimoErro: err.message,
              proximaTentativaEm: new Date(Date.now() + backoffMs).toISOString(),
              atualizadoEm: new Date().toISOString(),
            });
          }
          failedCount++;
        }

        processed++;
      }
    } catch (err: any) {
      console.error('[FilePersistence] Erro no reprocessamento da fila de uploads:', err);
    } finally {
      this.isReprocessing = false;
    }

    return { processed, successCount, failedCount };
  }

  /**
   * Gera Backup completo do Firestore em JSON e salva no Drive / Storage
   * Destino: Bella Top - Produção / _Backups do Sistema / AAAA / MM /
   */
  public static async createFirestoreBackup(criadoPor = 'Administrador'): Promise<{
    success: boolean;
    backup: BackupRecord;
    message: string;
  }> {
    const db = getFirestoreDb();
    const timestamp = new Date().toISOString();
    const now = new Date();
    const ano = now.getFullYear().toString();
    const mes = (now.getMonth() + 1).toString().padStart(2, '0');
    const backupId = `backup_${ano}${mes}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    const backupFileName = `${backupId}.json`;

    const collections = [
      'ops',
      'maquinas',
      'setores',
      'produtos',
      'clientes',
      'usuarios',
      'auditoria',
      'alertas',
      'config',
      'arquivos',
    ];

    const exportData: Record<string, any[]> = {};
    for (const colName of collections) {
      try {
        const snap = await db.collection(colName).get();
        exportData[colName] = snap.docs.map((d) => {
          const data = d.data();
          // Sanitização de segurança: remove hash/salt de senhas
          if (colName === 'usuarios') {
            const { passwordHash: _h, passwordSalt: _s, ...safeUser } = data as any;
            return safeUser;
          }
          return data;
        });
      } catch {
        exportData[colName] = [];
      }
    }

    const jsonString = JSON.stringify(
      {
        backupId,
        criadoEm: timestamp,
        criadoPor,
        versao: '2.0.0',
        sistema: 'Bella Top - Produção MES',
        dados: exportData,
      },
      null,
      2
    );

    const buffer = Buffer.from(jsonString, 'utf-8');
    const tamanho = buffer.length;

    // Salva no Firebase Storage como cópia de segurança
    const storagePath = await this.saveBinaryToStorage(
      backupId,
      backupFileName,
      'BACKUPS',
      'application/json',
      buffer
    );

    let driveFileId: string | null = null;
    let erro: string | null = null;
    let status: 'CONCLUIDO_DRIVE' | 'PENDENTE_DRIVE' | 'FALHA' = 'PENDENTE_DRIVE';

    // Tenta enviar para o Google Drive em 00_Backups/AAAA/MM/
    if (DriveBridge.isConfigured()) {
      try {
        const driveRes = await DriveBridge.backup(backupFileName, jsonString);
        if (driveRes && driveRes.ok && driveRes.file) {
          driveFileId = driveRes.file.id;
          status = 'CONCLUIDO_DRIVE';
        } else {
          erro = driveRes.error || 'Ponte do Drive retornou erro no backup';
        }
      } catch (err: any) {
        erro = err.message || 'Falha ao conectar com o Google Drive para backup';
      }
    } else {
      erro = 'DRIVE_BRIDGE_URL ou DRIVE_BRIDGE_TOKEN não configurados';
    }

    const backupRecord: BackupRecord = {
      id: backupId,
      data: timestamp,
      status,
      tamanho,
      driveFileId,
      storagePath,
      erro,
      criadoPor,
      collectionsIncluded: collections,
    };

    // Registra no Firestore em coleção 'backups' e em 'config/system'
    try {
      await db.collection('backups').doc(backupId).set(backupRecord);
      await db.collection('config').doc('system').set(
        {
          ultimoBackup: {
            id: backupId,
            data: timestamp,
            status,
            tamanho,
            driveFileId,
            erro,
          },
          updatedAt: timestamp,
        },
        { merge: true }
      );
    } catch (err: any) {
      console.error('[FilePersistence] Erro ao registrar backup no Firestore:', err);
    }

    return {
      success: true,
      backup: backupRecord,
      message:
        status === 'CONCLUIDO_DRIVE'
          ? 'Backup gerado e armazenado com sucesso no Google Drive (00_Backups) e Firebase Storage.'
          : `Backup salvo com segurança no Firebase Storage. Envio ao Drive pendente: ${erro}`,
    };
  }

  /**
   * Retorna estatísticas completas de armazenamento para o painel administrativo
   */
  public static async getStorageStatus(): Promise<{
    firebase: { status: 'CONNECTED' | 'ERROR'; projectId: string };
    firebaseStorage: { status: 'CONNECTED' | 'ERROR'; bucketName?: string };
    googleDrive: {
      status: 'CONNECTED' | 'NOT_CONFIGURED' | 'ERROR';
      rootFolder: { id: string; name: string; url: string };
      latencyMs: number;
      message: string;
    };
    counts: {
      total: number;
      enviados: number;
      pendentes: number;
      erros: number;
    };
    ultimoBackup: any;
    timestamp: string;
  }> {
    const db = getFirestoreDb();
    const driveHealth = await DriveBridge.checkHealth();

    let storageStatus: 'CONNECTED' | 'ERROR' = 'ERROR';
    let bucketName: string | undefined;

    try {
      const bucket = await getStorageBucket();
      storageStatus = 'CONNECTED';
      bucketName = bucket.name;
    } catch {
      storageStatus = 'ERROR';
    }

    let enviados = 0;
    let pendentes = 0;
    let erros = 0;
    let total = 0;

    try {
      const snapEnviados = await db.collection('arquivos').where('status', '==', 'ENVIADO').get();
      enviados = snapEnviados.size;

      const snapPendentes = await db.collection('arquivos').where('status', '==', 'PENDENTE_DRIVE').get();
      pendentes = snapPendentes.size;

      const snapErros = await db.collection('arquivos').where('status', '==', 'FALHA').get();
      erros = snapErros.size;

      total = enviados + pendentes + erros;
    } catch {
      // silêncio
    }

    let ultimoBackup: any = null;
    try {
      const configDoc = await db.collection('config').doc('system').get();
      if (configDoc.exists) {
        ultimoBackup = configDoc.data()?.ultimoBackup || null;
      }
      if (!ultimoBackup) {
        const snap = await db.collection('backups').orderBy('data', 'desc').limit(1).get();
        if (!snap.empty) {
          ultimoBackup = snap.docs[0].data();
        }
      }
    } catch {
      // silêncio
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

    return {
      firebase: {
        status: 'CONNECTED',
        projectId,
      },
      firebaseStorage: {
        status: storageStatus,
        bucketName,
      },
      googleDrive: {
        status: driveHealth.status,
        rootFolder: {
          id: driveHealth.rootFolderId,
          name: driveHealth.rootFolderName,
          url: driveHealth.rootFolderUrl,
        },
        latencyMs: driveHealth.latencyMs,
        message: driveHealth.message,
      },
      counts: {
        total,
        enviados,
        pendentes,
        erros,
      },
      ultimoBackup,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Inicia o worker em background para reprocessar a fila de arquivos pendentes
   */
  public static startQueueWorker(): void {
    if (this.queueTimer) return;

    this.queueTimer = setInterval(() => {
      this.reprocessPendingDriveQueue().catch(() => {});
    }, 45000);

    setTimeout(() => {
      this.reprocessPendingDriveQueue().catch(() => {});
    }, 10000);
  }
}
