/**
 * shared/orderMedia.ts
 * Utilitários compartilhados para saneamento, validação e controle de tamanho
 * das mídias das Ordens de Produção (OP) no Bella Top MES.
 *
 * Diretrizes:
 * - Limite seguro de documento no Firestore: 900 KB (margem do teto de 1 MiB).
 * - Sem uso ou cobrança de Firebase Storage.
 * - Miniaturas pequenas e layouts comprimidos em formato data URL (JPEG ~0.7, máx 800px).
 */

export const FIRESTORE_DOC_SAFE_LIMIT_BYTES = 900 * 1024; // 900 KB
export const MAX_MEDIA_DIMENSION_PX = 800;
export const JPEG_COMPRESSION_QUALITY = 0.7;
export const THUMBNAIL_MAX_DIMENSION_PX = 400;

export interface SanitizeResult<T> {
  order: T;
  movedFields: string[];
  droppedFields: string[];
}

export function isDataUrl(val: unknown): val is string {
  return typeof val === 'string' && val.startsWith('data:');
}

export function isBulkyMedia(val: unknown, thresholdBytes = 200 * 1024): boolean {
  if (typeof val !== 'string') return false;
  if (val.length < 500) return false;
  if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/api/')) return false;
  if (val.length > thresholdBytes) return true;
  // Se não começar com data:image, é anexo binário bruto (ex: PDF cru)
  if (!val.startsWith('data:image')) return true;
  return false;
}

/**
 * Calcula o tamanho aproximado em bytes de um documento serializado.
 */
export function estimateDocumentSizeBytes(doc: unknown): number {
  if (!doc) return 0;
  if (typeof Buffer !== 'undefined' && Buffer.byteLength) {
    return Buffer.byteLength(JSON.stringify(doc), 'utf-8');
  }
  return new Blob([JSON.stringify(doc)]).size;
}

/**
 * Validação estrita do tamanho do documento para o Firestore.
 * Lança erro explícito se exceder 900 KB.
 */
export function assertFitsFirestoreDocument(doc: unknown, label: string): void {
  const size = estimateDocumentSizeBytes(doc);
  if (size > FIRESTORE_DOC_SAFE_LIMIT_BYTES) {
    const kb = Math.round(size / 1024);
    throw new Error(
      `${label} tem ${kb} KB e excede o limite de 900 KB por documento do Firestore. ` +
        'A imagem anexada precisa ser redimensionada e comprimida no navegador (máx 800px, JPEG ~0.7) antes de salvar.'
    );
  }
}

/**
 * Higieniza o documento da OP antes de gravar no Firestore ou salvar no storage local:
 * - Preserva miniaturas data URL compactas (< 250 KB) geradas pelo navegador;
 * - Higieniza dados brutos volumosos (como anexos de PDF crus > 200 KB) em layoutImages;
 * - Garante compatibilidade com OPs legadas e novas sem deletar dados úteis.
 */
export async function sanitizeOrderMedia<T extends Record<string, any>>(
  order: T
): Promise<SanitizeResult<T>> {
  const sanitized: Record<string, any> = { ...order };
  const movedFields: string[] = [];
  const droppedFields: string[] = [];

  // Higieniza layoutImages para remover strings brutas de PDF/binário que ultrapassem 200 KB
  if (Array.isArray(sanitized.layoutImages)) {
    sanitized.layoutImages = sanitized.layoutImages.map((img: any, idx: number) => {
      if (img && typeof img.urlOrBase64 === 'string' && img.urlOrBase64.length > 200 * 1024) {
        droppedFields.push(`layoutImages[${idx}]`);
        return {
          ...img,
          urlOrBase64: sanitized.layoutPreviewImage || sanitized.productThumbnail || '',
        };
      }
      return img;
    });
  }

  // Descarta op_file ou layout_file se contiverem base64 bruto gigante em vez de nome/URL
  if (typeof sanitized.op_file === 'string' && sanitized.op_file.length > 100 * 1024) {
    sanitized.op_file = sanitized.opFileName || 'Ordem_Producao.pdf';
  }
  if (typeof sanitized.layout_file === 'string' && sanitized.layout_file.length > 100 * 1024) {
    sanitized.layout_file = sanitized.layoutFileName || 'Layout_Aprovado.pdf';
  }

  return { order: sanitized as T, movedFields, droppedFields };
}
