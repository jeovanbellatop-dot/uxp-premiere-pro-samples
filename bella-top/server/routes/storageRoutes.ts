import { Router, Request, Response } from 'express';
import { FilePersistenceService } from '../filePersistenceService';

export const storageRoutes = Router();

interface UploadBody {
  fileName?: string;
  mimeType?: string;
  dataUrl?: string;
  folder?: string;
  opNumero?: string;
  opId?: string;
}

// Upload compatível com /api/storage/upload e integrado com DriveBridge + Firestore
storageRoutes.post('/upload', async (req: Request, res: Response) => {
  try {
    const body = req.body as UploadBody;
    if (!body || !body.dataUrl) {
      return res.status(400).json({ success: false, error: 'Campo dataUrl é obrigatório.' });
    }

    const folder = body.folder || 'Documentos';
    const categoria =
      folder.includes('layout') ? 'Layouts' :
      folder.includes('op-pdf') ? 'PDF da OP' :
      folder.includes('foto') ? 'Fotos' : 'Documentos';

    const result = await FilePersistenceService.saveAndUploadFile({
      opNumero: body.opNumero || 'GERAL',
      opId: body.opId,
      categoria,
      fileName: body.fileName || `arquivo_${Date.now()}`,
      mimeType: body.mimeType,
      dataUrl: body.dataUrl,
    });

    return res.status(201).json({
      success: true,
      data: {
        url: result.url,
        path: result.file.fileId,
        mimeType: result.file.mimeType,
        size: result.file.size,
        status: result.file.status,
      },
      file: result.file,
      url: result.url,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Falha ao enviar arquivo.' });
  }
});
