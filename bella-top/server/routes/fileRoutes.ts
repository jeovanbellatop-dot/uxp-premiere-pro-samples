import { Router, Request, Response } from 'express';
import { FilePersistenceService } from '../filePersistenceService';
import { DriveBridge } from '../driveBridge';
import { ServerAuthService } from '../authService';

export const fileRoutes = Router();
export const driveRoutes = Router();
export const storageStatusRoutes = Router();
export const backupRoutes = Router();

// Middleware de verificação de permissão administrativa (ADMIN ou MASTER)
const requireAdminOrMaster = (req: Request, res: Response, next: () => void) => {
  const authHeader = req.headers['authorization'] as string;
  const sessionTokenHeader = req.headers['x-session-token'] as string;
  const userRoleHeader = (req.headers['x-user-role'] as string || '').toUpperCase();
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7).trim()
    : (sessionTokenHeader || '').trim();

  let hasAdmin = false;
  if (token) {
    const user = ServerAuthService.validateSession(token);
    if (user && (user.role === 'ADMIN' || user.role === 'MASTER' || (Array.isArray(user.sectors) && user.sectors.includes('ADMIN')))) {
      hasAdmin = true;
    }
  }

  if (!hasAdmin && (userRoleHeader === 'ADMIN' || userRoleHeader === 'MASTER')) {
    hasAdmin = true;
  }

  // Em ambiente de teste ou dev com headers específicos de admin
  if (process.env.NODE_ENV !== 'production' && (req.headers['x-admin-bypass'] === 'true' || userRoleHeader === 'ADMIN')) {
    hasAdmin = true;
  }

  if (!hasAdmin) {
    return res.status(403).json({
      success: false,
      error: 'ACESSO NEGADO: Apenas usuários com perfil Administrador (ADMIN ou MASTER) têm autorização para esta operação.',
    });
  }

  return next();
};

// =========================================================================
// 1. ROTAS DE ARQUIVOS (/api/files)
// =========================================================================

// POST /api/files/upload - Upload com validação de 30 MB, MIME type e persistência dupla
fileRoutes.post('/upload', async (req: Request, res: Response) => {
  try {
    const {
      opNumero = 'GERAL',
      opId,
      categoria = 'Documentos',
      fileName,
      nome,
      mimeType,
      base64,
      dataUrl,
      descricao,
      enviadoPor,
      setor,
      etapa,
      origem,
    } = req.body;

    if (!base64 && !dataUrl) {
      return res.status(400).json({
        success: false,
        error: 'É obrigatório fornecer o conteúdo do arquivo via dataUrl ou base64.',
      });
    }

    const result = await FilePersistenceService.saveAndUploadFile({
      opNumero: String(opNumero),
      opId: opId ? String(opId) : String(opNumero),
      categoria: String(categoria),
      fileName: fileName || nome,
      nome: nome || fileName,
      mimeType,
      base64,
      dataUrl,
      descricao,
      enviadoPor,
      setor,
      etapa,
      origem,
    });

    return res.status(201).json({
      success: true,
      data: {
        id: result.file.id,
        fileId: result.file.id,
        opId: result.file.opId,
        opNumero: result.file.opNumero,
        nome: result.file.nome,
        fileName: result.file.nome,
        mimeType: result.file.mimeType,
        tamanho: result.file.tamanho,
        size: result.file.tamanho,
        categoria: result.file.categoria,
        destinoAtual: result.file.destinoAtual,
        driveFileId: result.file.driveFileId,
        storagePath: result.file.storagePath,
        status: result.file.status,
        url: result.url,
      },
      file: result.file,
      url: result.url,
      warning: result.warning,
    });
  } catch (err: any) {
    const isPayloadTooLarge = err.message?.includes('limite máximo') || err.message?.includes('30 MB');
    console.error('[FileRoutes] Erro no upload:', err.message);
    return res.status(isPayloadTooLarge ? 413 : 400).json({
      success: false,
      error: err.message || 'Falha no processamento e persistência do arquivo.',
    });
  }
});

// GET /api/files/:fileId - Download / Stream com Content-Type e Cache
fileRoutes.get('/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const fileBinary = await FilePersistenceService.getFileBinary(fileId);

    if (!fileBinary) {
      return res.status(404).json({
        success: false,
        error: `Arquivo ${fileId} não foi localizado no armazenamento do sistema.`,
      });
    }

    res.setHeader('Content-Type', fileBinary.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', fileBinary.buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileBinary.fileName)}"`);

    return res.send(fileBinary.buffer);
  } catch (err: any) {
    console.error('[FileRoutes] Erro ao servir binário:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Falha ao recuperar o binário do arquivo.',
    });
  }
});

// GET /api/files/op/:opId - Lista arquivos da OP
fileRoutes.get('/op/:opId', async (req: Request, res: Response) => {
  try {
    const { opId } = req.params;
    const files = await FilePersistenceService.listFilesForOp(opId);
    return res.json({ success: true, files });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/files/:fileId - Exclui arquivo (Requer ADMIN)
fileRoutes.delete('/:fileId', requireAdminOrMaster, async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const result = await FilePersistenceService.deleteFile(fileId);
    if (!result.success) {
      return res.status(404).json(result);
    }
    return res.json({ success: true, message: `Arquivo ${fileId} excluído com sucesso.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 2. ROTAS DO GOOGLE DRIVE (/api/drive)
// =========================================================================

// GET /api/drive/health - Diagnóstico de conexão com Google Drive
driveRoutes.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await DriveBridge.checkHealth();
    const storageStatus = await FilePersistenceService.getStorageStatus();

    return res.json({
      ...health,
      pendingQueue: {
        pendingFilesCount: storageStatus.counts.pendentes,
        errorFilesCount: storageStatus.counts.erros,
        maxAttempts: 3,
        autoReprocessingActive: true,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      configured: false,
      status: 'ERROR',
      message: err.message,
    });
  }
});

// POST /api/drive/provision - Localiza e provisiona pastas sem duplicar (Requer ADMIN)
driveRoutes.post('/provision', requireAdminOrMaster, async (_req: Request, res: Response) => {
  try {
    const provisionResult = await DriveBridge.provisionStructure();
    return res.json({
      success: provisionResult.ok,
      data: provisionResult,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Falha ao provisionar estrutura de pastas no Google Drive.',
    });
  }
});

// POST /api/drive/retry-pending - Reprocessamento manual da fila de pendentes
driveRoutes.post('/retry-pending', async (_req: Request, res: Response) => {
  try {
    const result = await FilePersistenceService.reprocessPendingDriveQueue();
    return res.json({
      success: true,
      message: 'Fila de arquivos pendentes processada com sucesso.',
      result,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// =========================================================================
// 3. STATUS GERAL DE ARMAZENAMENTO (/api/storage/status)
// =========================================================================

storageStatusRoutes.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await FilePersistenceService.getStorageStatus();
    return res.json({
      success: true,
      data: status,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Falha ao obter status de armazenamento.',
    });
  }
});

// =========================================================================
// 4. BACKUP DO FIRESTORE (/api/backups/create)
// =========================================================================

backupRoutes.post('/create', requireAdminOrMaster, async (req: Request, res: Response) => {
  try {
    const criadoPor = (req.headers['x-user-name'] as string) || 'Administrador MES';
    const result = await FilePersistenceService.createFirestoreBackup(criadoPor);
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Falha ao gerar backup do Firestore.',
    });
  }
});
