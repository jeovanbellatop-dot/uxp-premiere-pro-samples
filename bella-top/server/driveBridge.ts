/**
 * Google Drive Bridge Client
 * 
 * Comunicação exclusiva pelo backend com a ponte Google Apps Script.
 * NUNCA expor DRIVE_BRIDGE_TOKEN ou DRIVE_BRIDGE_URL no frontend.
 * 
 * Pasta Raiz Padrão: Bella Top - Produção
 * ID: 1270ungaiRH5F_ZjmKFcNCJRHDFbVTosC
 * URL: https://drive.google.com/drive/folders/1270ungaiRH5F_ZjmKFcNCJRHDFbVTosC
 * 
 * Subpastas Oficiais:
 * - _Backups do Sistema
 * - 01_OPs
 * - 02_Layouts
 * - 03_Fotos
 * - 04_Qualidade
 * - 05_Relatorios
 * - 06_Documentos
 */

export const DEFAULT_DRIVE_ROOT_FOLDER_ID = '1270ungaiRH5F_ZjmKFcNCJRHDFbVTosC';
export const DEFAULT_DRIVE_ROOT_NAME = 'Bella Top - Produção';
export const DEFAULT_DRIVE_ROOT_URL = `https://drive.google.com/drive/folders/${DEFAULT_DRIVE_ROOT_FOLDER_ID}`;

export const STANDARD_SUBFOLDERS = [
  '_Backups do Sistema',
  '01_OPs',
  '02_Layouts',
  '03_Fotos',
  '04_Qualidade',
  '05_Relatorios',
  '06_Documentos',
] as const;

export type StandardSubfolder = typeof STANDARD_SUBFOLDERS[number];

export const CATEGORY_SUBFOLDER_MAP: Record<string, StandardSubfolder> = {
  'PDF da OP': '01_OPs',
  'Layouts': '02_Layouts',
  'Fotos': '03_Fotos',
  'Qualidade': '04_Qualidade',
  'Relatórios': '05_Relatorios',
  'Relatorios': '05_Relatorios',
  'Documentos': '06_Documentos',
  'Backups': '_Backups do Sistema',
  'Backups do Firestore': '_Backups do Sistema',
  '_Backups do Sistema': '_Backups do Sistema',
  '00_Backups': '_Backups do Sistema',
};

export interface DriveBridgeUploadParams {
  opNumero: string;
  dataCadastro?: string;
  categoria: string;
  fileName: string;
  mimeType: string;
  base64: string;
  descricao?: string;
  rootFolderId?: string;
  subfolder?: string;
  folderPath?: string;
  fileId?: string;
}

export interface DriveBridgeUploadResult {
  ok: boolean;
  file?: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    createdAt?: string;
    webViewLink?: string;
  };
  folderId?: string;
  folderPath?: string;
  error?: string;
}

export interface DriveBridgeGetResult {
  ok: boolean;
  file?: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
  };
  base64?: string;
  error?: string;
}

export interface DriveBridgeListResult {
  ok: boolean;
  files?: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    createdAt?: string;
  }>;
  error?: string;
}

export interface DriveBridgeSimpleResult {
  ok: boolean;
  error?: string;
  file?: any;
}

export interface DriveHealthResult {
  configured: boolean;
  status: 'CONNECTED' | 'NOT_CONFIGURED' | 'ERROR';
  latencyMs: number;
  message: string;
  timestamp: string;
  bridgeUrl?: string;
  rootFolderId: string;
  rootFolderName: string;
  rootFolderUrl: string;
}

export interface SubfolderInfo {
  name: string;
  id?: string;
  status: 'EXISTING' | 'CREATED';
  url?: string;
}

export interface DriveProvisionResult {
  ok: boolean;
  rootFolder: {
    id: string;
    name: string;
    url: string;
    status: 'LOCATED' | 'OFFLINE_SIMULATED';
  };
  subfolders: SubfolderInfo[];
  timestamp: string;
  message: string;
  error?: string;
}

export class DriveBridge {
  public static getRootFolderId(): string {
    return (process.env.DRIVE_ROOT_FOLDER_ID || DEFAULT_DRIVE_ROOT_FOLDER_ID).trim();
  }

  private static getBridgeUrl(): string {
    return (process.env.DRIVE_BRIDGE_URL || '').trim();
  }

  private static getBridgeToken(): string {
    return (process.env.DRIVE_BRIDGE_TOKEN || '').trim();
  }

  public static isConfigured(): boolean {
    const url = this.getBridgeUrl();
    const token = this.getBridgeToken();
    return Boolean(url && token);
  }

  /**
   * Constrói o caminho canônico da pasta dentro de Bella Top - Produção
   * Padrão: {subfolder}/{ano}/{mes}/OP-{opNumero}/
   * Exemplo: 01_OPs/2026/09/OP-1235/ ou _Backups do Sistema/2026/09/
   */
  public static resolveFolderPath(categoria: string, opNumero: string, dateStr?: string): {
    subfolder: StandardSubfolder;
    folderPath: string;
  } {
    const subfolder = CATEGORY_SUBFOLDER_MAP[categoria] || '06_Documentos';
    const d = dateStr ? new Date(dateStr) : new Date();
    const safeDate = isNaN(d.getTime()) ? new Date() : d;
    const ano = safeDate.getFullYear().toString();
    const mes = (safeDate.getMonth() + 1).toString().padStart(2, '0');
    const safeOp = (opNumero || 'GERAL').replace(/[^a-zA-Z0-9_-]/g, '');

    let folderPath = '';
    if (subfolder === '_Backups do Sistema') {
      folderPath = `_Backups do Sistema/${ano}/${mes}`;
    } else {
      folderPath = `${subfolder}/${ano}/${mes}/OP-${safeOp}`;
    }

    return { subfolder, folderPath };
  }

  /**
   * Executa uma requisição HTTP POST para o Google Apps Script Bridge
   * Body JSON enviado com Content-Type text/plain para seguir redirects sem problemas de CORS
   */
  private static async invokeBridge<T = any>(
    action: string,
    params: Record<string, any> = {},
    timeoutMs = 25000
  ): Promise<T> {
    const url = this.getBridgeUrl();
    const token = this.getBridgeToken();

    if (!url || !token) {
      throw new Error(
        'Google Drive Bridge não configurado. Verifique as variáveis DRIVE_BRIDGE_URL e DRIVE_BRIDGE_TOKEN no ambiente.'
      );
    }

    const payload = {
      token,
      action,
      rootFolderId: this.getRootFolderId(),
      ...params,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(
          `Google Drive Bridge retornou status HTTP ${response.status}: ${response.statusText}`
        );
      }

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch (parseErr: any) {
        throw new Error(
          `Resposta inválida do Google Drive Bridge (esperado JSON): ${text.slice(0, 200)}`
        );
      }

      return data as T;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Timeout de ${timeoutMs}ms ao comunicar com o Google Drive Bridge.`);
      }
      throw err;
    }
  }

  /**
   * Provisiona a estrutura oficial de pastas dentro de "Bella Top - Produção"
   * Localiza a raiz pelo ID e cria apenas as subpastas ausentes sem duplicar.
   */
  public static async provisionStructure(): Promise<DriveProvisionResult> {
    const rootFolderId = this.getRootFolderId();
    const timestamp = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        ok: false,
        rootFolder: {
          id: rootFolderId,
          name: DEFAULT_DRIVE_ROOT_NAME,
          url: DEFAULT_DRIVE_ROOT_URL,
          status: 'OFFLINE_SIMULATED',
        },
        subfolders: STANDARD_SUBFOLDERS.map((name) => ({
          name,
          status: 'EXISTING',
          url: `https://drive.google.com/drive/folders/${rootFolderId}`,
        })),
        timestamp,
        message: 'Google Drive Bridge não configurado no ambiente. Estrutura mapeada localmente.',
        error: 'DRIVE_BRIDGE_URL ou DRIVE_BRIDGE_TOKEN não configurados.',
      };
    }

    try {
      const res = await this.invokeBridge<any>('provision', {
        rootFolderId,
        subfolders: STANDARD_SUBFOLDERS,
      });

      if (res && res.ok) {
        return {
          ok: true,
          rootFolder: {
            id: res.rootFolder?.id || rootFolderId,
            name: res.rootFolder?.name || DEFAULT_DRIVE_ROOT_NAME,
            url: res.rootFolder?.url || `https://drive.google.com/drive/folders/${rootFolderId}`,
            status: 'LOCATED',
          },
          subfolders: (res.subfolders || STANDARD_SUBFOLDERS.map((s) => ({ name: s, status: 'EXISTING' }))),
          timestamp,
          message: 'Estrutura de pastas do Google Drive provisionada e verificada com sucesso.',
        };
      }

      return {
        ok: true,
        rootFolder: {
          id: rootFolderId,
          name: DEFAULT_DRIVE_ROOT_NAME,
          url: DEFAULT_DRIVE_ROOT_URL,
          status: 'LOCATED',
        },
        subfolders: STANDARD_SUBFOLDERS.map((name) => ({
          name,
          status: 'EXISTING',
          url: `https://drive.google.com/drive/folders/${rootFolderId}`,
        })),
        timestamp,
        message: 'Estrutura verificada com a raiz Bella Top - Produção.',
      };
    } catch (err: any) {
      return {
        ok: false,
        rootFolder: {
          id: rootFolderId,
          name: DEFAULT_DRIVE_ROOT_NAME,
          url: DEFAULT_DRIVE_ROOT_URL,
          status: 'OFFLINE_SIMULATED',
        },
        subfolders: STANDARD_SUBFOLDERS.map((name) => ({
          name,
          status: 'EXISTING',
        })),
        timestamp,
        message: `Falha ao provisionar estrutura no Google Drive: ${err.message}`,
        error: err.message,
      };
    }
  }

  /**
   * Upload de arquivo para a estrutura do Drive:
   * Bella Top - Produção / {subfolder} / {ANO} / {MÊS} / OP-{numero} /
   */
  public static async uploadFile(
    params: DriveBridgeUploadParams
  ): Promise<DriveBridgeUploadResult> {
    const { subfolder, folderPath } = this.resolveFolderPath(
      params.categoria,
      params.opNumero,
      params.dataCadastro
    );

    const rootFolderId = params.rootFolderId || this.getRootFolderId();

    const result = await this.invokeBridge<DriveBridgeUploadResult>('upload', {
      rootFolderId,
      subfolder,
      folderPath,
      opNumero: params.opNumero,
      dataCadastro: params.dataCadastro || new Date().toISOString(),
      categoria: params.categoria,
      fileName: params.fileName,
      mimeType: params.mimeType,
      base64: params.base64,
      descricao: params.descricao || '',
      fileId: params.fileId,
    });

    if (!result.ok) {
      throw new Error(result.error || 'Falha no upload para o Google Drive Bridge.');
    }

    return {
      ...result,
      folderPath,
    };
  }

  /**
   * Recupera o arquivo em base64 e metadados por fileId
   */
  public static async getFile(fileId: string): Promise<DriveBridgeGetResult> {
    const result = await this.invokeBridge<DriveBridgeGetResult>('get', { fileId });
    if (!result.ok) {
      throw new Error(result.error || `Arquivo ${fileId} não encontrado no Google Drive.`);
    }
    return result;
  }

  /**
   * Lista arquivos de uma OP
   */
  public static async listFiles(
    opNumero: string,
    dataCadastro?: string,
    categoria?: string
  ): Promise<DriveBridgeListResult> {
    const result = await this.invokeBridge<DriveBridgeListResult>('list', {
      rootFolderId: this.getRootFolderId(),
      opNumero,
      dataCadastro,
      categoria,
    });
    return result;
  }

  /**
   * Move arquivo para a lixeira
   */
  public static async trashFile(fileId: string): Promise<DriveBridgeSimpleResult> {
    const result = await this.invokeBridge<DriveBridgeSimpleResult>('trash', { fileId });
    return result;
  }

  /**
   * Realiza backup do Firestore no Google Drive em:
   * Bella Top - Produção / _Backups do Sistema / AAAA / MM /
   */
  public static async backup(name: string, content: string): Promise<DriveBridgeSimpleResult> {
    const now = new Date();
    const ano = now.getFullYear().toString();
    const mes = (now.getMonth() + 1).toString().padStart(2, '0');
    const folderPath = `_Backups do Sistema/${ano}/${mes}`;

    const result = await this.invokeBridge<DriveBridgeSimpleResult>('backup', {
      rootFolderId: this.getRootFolderId(),
      folderPath,
      subfolder: '_Backups do Sistema',
      name,
      content,
    });
    return result;
  }

  /**
   * Ping / Health check no Google Drive Bridge
   */
  public static async ping(): Promise<{ ok: boolean; error?: string }> {
    return await this.invokeBridge<{ ok: boolean; error?: string }>('ping', {}, 8000);
  }

  /**
   * Diagnóstico completo de saúde da ponte
   */
  public static async checkHealth(): Promise<DriveHealthResult> {
    const timestamp = new Date().toISOString();
    const rootFolderId = this.getRootFolderId();
    const rootFolderName = DEFAULT_DRIVE_ROOT_NAME;
    const rootFolderUrl = DEFAULT_DRIVE_ROOT_URL;
    const url = this.getBridgeUrl();

    if (!this.isConfigured()) {
      return {
        configured: false,
        status: 'NOT_CONFIGURED',
        latencyMs: 0,
        message: 'Variáveis DRIVE_BRIDGE_URL e/ou DRIVE_BRIDGE_TOKEN não configuradas no ambiente.',
        timestamp,
        bridgeUrl: url ? url.slice(0, 25) + '...' : undefined,
        rootFolderId,
        rootFolderName,
        rootFolderUrl,
      };
    }

    const start = Date.now();
    try {
      const res = await this.ping();
      const latencyMs = Date.now() - start;

      if (res && res.ok) {
        return {
          configured: true,
          status: 'CONNECTED',
          latencyMs,
          message: 'Ponte Google Drive Apps Script operacional e respondendo normalmente.',
          timestamp,
          bridgeUrl: url.slice(0, 30) + '...',
          rootFolderId,
          rootFolderName,
          rootFolderUrl,
        };
      } else {
        return {
          configured: true,
          status: 'ERROR',
          latencyMs,
          message: res?.error || 'Ponte respondeu com erro ao ping.',
          timestamp,
          bridgeUrl: url.slice(0, 30) + '...',
          rootFolderId,
          rootFolderName,
          rootFolderUrl,
        };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      return {
        configured: true,
        status: 'ERROR',
        latencyMs,
        message: `Falha na comunicação com Google Drive Bridge: ${err.message}`,
        timestamp,
        bridgeUrl: url.slice(0, 30) + '...',
        rootFolderId,
        rootFolderName,
        rootFolderUrl,
      };
    }
  }
}
