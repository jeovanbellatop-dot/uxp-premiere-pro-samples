import { ExtractedOpData } from '../types/mes';
import { processDocumentFile } from '../utils/pdfRenderer';
import { cropImageFromCoords, getDefaultLayoutCropBox, CropBox, compressImageToDataUrl } from '../utils/imageCropper';
import { loadFileOnce, type LoadedFile } from '../utils/loadedFile';

/**
 * Cabeçalhos com a sessão do usuário logado. A rota /api/op/parse-pdf exige
 * autenticação; sem o token o servidor respondia 401 na leitura da OP.
 */
function getOpAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('bellatop_auth_session_v3') : null;
    const token = raw ? JSON.parse(raw)?.token : null;
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
      headers['x-session-token'] = token;
    }
  } catch {
    // sessão ilegível: segue sem token e o servidor informa o erro
  }
  return headers;
}

export interface ParseOpResponse {
  success: boolean;
  source: string;
  data: ExtractedOpData;
  error?: string;
}

export interface ParseOpFilesParams {
  /** Arquivos JÁ LIDOS em memória (loadFileOnce), nunca o objeto File cru. */
  opFile: LoadedFile;
  layoutFile: LoadedFile;
}

/**
 * Realiza o processamento completo e real dos dois arquivos obrigatórios da OP:
 * 1) PDF da OP: extrai o texto de todas as páginas e renderiza a visualização.
 * 2) PDF/Imagem do Layout: renderiza em alta definição e recorta a foto oficial da sacola.
 */
export async function parseOpFiles({
  opFile,
  layoutFile,
}: ParseOpFilesParams): Promise<ExtractedOpData> {
  try {
    console.log('[opReaderService] Processando arquivos locais (OP e Layout)...');

    // 1. Processar e renderizar ambos os documentos para extração de texto e imagem real
    const [opProcessed, layoutProcessed] = await Promise.all([
      processDocumentFile(opFile),
      processDocumentFile(layoutFile),
    ]);

    // 2. Montar os payloads com o base64 original, imagem PNG renderizada e o texto extraído
    const opDoc = {
      base64: opFile.base64,
      mimeType: opFile.type || 'application/pdf',
      fileName: opFile.name,
      textContent: opProcessed.textContent,
      previewImage: opProcessed.dataUrl,
      type: 'op_document',
    };

    const layoutDoc = {
      base64: layoutFile.base64,
      mimeType: layoutFile.type || (layoutFile.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
      fileName: layoutFile.name,
      textContent: layoutProcessed.textContent,
      previewImage: layoutProcessed.dataUrl,
      type: 'layout_document',
    };

    const payload = {
      opDocument: opDoc,
      layoutDocument: layoutDoc,
      textContent: opProcessed.textContent,
      documents: [opDoc, layoutDoc],
      fileName: `${opFile.name} + ${layoutFile.name}`,
    };

    console.log('[opReaderService] Enviando documentos para análise estruturada no backend...');
    const response = await fetch('/api/op/parse-pdf', {
      method: 'POST',
      headers: getOpAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
      response.status === 401
        ? 'Sua sessão expirou. Saia e entre novamente no sistema para importar a OP.'
        : `Erro no servidor HTTP (${response.status}): Falha na leitura dos documentos.`
    );
    }

    const result: ParseOpResponse = await response.json();

    if (result.success && result.data) {
      const data = result.data;
      data.opFileName = opFile.name;
      data.op_file = opFile.name;
      data.layoutFileName = layoutFile.name;
      data.layout_file = layoutFile.name;
      data.layoutStatus = 'COMPLETO';
      data.layout_status = 'COMPLETO';

      // 3. Garantir que a prévia do layout completo utiliza imagem compactada (máximo 800px, JPEG 0.7)
      const compressedLayout = await compressImageToDataUrl(layoutProcessed.dataUrl, 800, 0.7);
      data.layoutPreviewImage = compressedLayout;
      data.layoutImage = compressedLayout;

      // 4. Localizar e recortar a foto principal da sacola a partir do Layout aprovado
      let targetCrop: CropBox;
      if (data.layoutCropBox) {
        targetCrop = data.layoutCropBox;
      } else if (data.structured?.op?.crop_box) {
        const box = data.structured.op.crop_box;
        targetCrop = {
          x: Math.max(0, Math.min(100, box.xmin / 10)),
          y: Math.max(0, Math.min(100, box.ymin / 10)),
          width: Math.max(10, Math.min(100, (box.xmax - box.xmin) / 10)),
          height: Math.max(10, Math.min(100, (box.ymax - box.ymin) / 10)),
        };
        data.layoutCropBox = targetCrop;
      } else {
        targetCrop = getDefaultLayoutCropBox();
        data.layoutCropBox = targetCrop;
      }

      try {
        console.log('[opReaderService] Recortando foto principal da sacola do layout...');
        const croppedThumbnail = await cropImageFromCoords(compressedLayout, targetCrop, 400, 400);
        const compressedThumb = await compressImageToDataUrl(croppedThumbnail, 400, 0.7);
        data.productThumbnail = compressedThumb;
        data.productThumbnailStatus = 'available';
      } catch (cropErr) {
        console.warn('[opReaderService] Falha no recorte automático da sacola, usando layout completo:', cropErr);
        data.productThumbnail = compressedLayout;
        data.productThumbnailStatus = 'available';
      }

      // Higieniza array de imagens para não conter strings brutas de PDF (> 500 chars sem data:)
      if (Array.isArray(data.images)) {
        data.images = data.images.map((img) => ({
          ...img,
          urlOrBase64: (img.urlOrBase64 && img.urlOrBase64.length > 500 && !img.urlOrBase64.startsWith('data:'))
            ? compressedLayout
            : img.urlOrBase64,
        }));
      }

      return data;
    }

    throw new Error(result.error || 'Não foi possível extrair os dados da OP dos arquivos enviados.');
  } catch (error: any) {
    console.error('[opReaderService] Falha crítica no processamento da OP e Layout:', error);
    throw error;
  }
}

export async function parseOpDocument(
  fileOrText: File | File[] | string,
  sampleName?: string
): Promise<ExtractedOpData> {
  try {
    let payload: any = {};
    if (typeof fileOrText === 'string') {
      payload = { textContent: fileOrText, fileName: sampleName || 'Documento_OP.txt' };
    } else {
      const files = Array.isArray(fileOrText) ? fileOrText : [fileOrText];
      const documents = await Promise.all(
        files.map(async (file) => {
          // Uma única leitura do arquivo, reaproveitada em todas as etapas.
          const loaded = await loadFileOnce(file);
          const processed = await processDocumentFile(loaded);
          return {
            base64: loaded.base64,
            mimeType: loaded.type,
            fileName: loaded.name,
            textContent: processed.textContent,
            previewImage: processed.dataUrl,
          };
        })
      );
      payload = {
        documents,
        textContent: documents.map((d) => d.textContent).filter(Boolean).join('\n\n'),
        fileName: documents.map((document) => document.fileName).join(' + '),
      };
    }

    const response = await fetch('/api/op/parse-pdf', {
      method: 'POST',
      headers: getOpAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Erro no servidor HTTP: ' + response.status);
    const result: ParseOpResponse = await response.json();
    if (result.success && result.data) return result.data;
    throw new Error(result.error || 'Não foi possível extrair os dados da OP');
  } catch (error: any) {
    console.error('Falha no leitor de OP:', error);
    throw error;
  }
}
