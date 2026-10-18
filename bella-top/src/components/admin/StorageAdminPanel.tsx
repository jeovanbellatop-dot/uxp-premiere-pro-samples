import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Cloud,
  Database,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  FolderTree,
  ExternalLink,
  ShieldCheck,
  Archive,
  ArrowUpRight,
  Clock,
  Layers,
  FileCheck2,
  AlertCircle
} from 'lucide-react';
import { useMesStore } from '../../hooks/useMesStore';

interface StorageStatusData {
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
  ultimoBackup: {
    id?: string;
    data?: string;
    status?: string;
    tamanho?: number;
    driveFileId?: string | null;
    erro?: string | null;
  } | null;
  timestamp: string;
}

export const StorageAdminPanel: React.FC = () => {
  const { authenticatedUser } = useMesStore();
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<StorageStatusData | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [provisionInfo, setProvisionInfo] = useState<any | null>(null);

  const isAdmin =
    authenticatedUser?.role === 'ADMIN' ||
    (authenticatedUser?.role as string) === 'MASTER' ||
    (authenticatedUser?.sectors && authenticatedUser.sectors.includes('ADMIN'));

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/storage/status', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setStatusData(json.data);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Erro ao obter status de armazenamento: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleProvisionDrive = async () => {
    if (!isAdmin) {
      setFeedback({ type: 'error', message: 'Apenas Administradores podem provisionar pastas no Google Drive.' });
      return;
    }
    setActionLoading('provision');
    setFeedback(null);
    try {
      const res = await fetch('/api/drive/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': authenticatedUser?.role || 'ADMIN',
          'x-user-name': authenticatedUser?.name || 'Administrador',
        },
      });
      const json = await res.json();
      if (json.success) {
        setProvisionInfo(json.data);
        setFeedback({
          type: 'success',
          message: 'Estrutura de pastas verificada e provisionada com sucesso no Google Drive!',
        });
        fetchStatus();
      } else {
        setFeedback({
          type: 'error',
          message: json.error || 'Falha ao provisionar pastas no Drive.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Erro ao provisionar: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryPending = async () => {
    setActionLoading('retry');
    setFeedback(null);
    try {
      const res = await fetch('/api/drive/retry-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (json.success) {
        setFeedback({
          type: 'success',
          message: `Processamento concluído: ${json.result?.successCount || 0} enviado(s), ${json.result?.failedCount || 0} com erro ou aguardando backoff.`,
        });
        fetchStatus();
      } else {
        setFeedback({ type: 'error', message: json.error || 'Falha ao reprocessar pendentes.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Erro ao reprocessar: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateBackup = async () => {
    if (!isAdmin) {
      setFeedback({ type: 'error', message: 'Apenas Administradores podem disparar o backup do sistema.' });
      return;
    }
    setActionLoading('backup');
    setFeedback(null);
    try {
      const res = await fetch('/api/backups/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': authenticatedUser?.role || 'ADMIN',
          'x-user-name': authenticatedUser?.name || 'Administrador',
        },
      });
      const json = await res.json();
      if (json.success) {
        setFeedback({
          type: 'success',
          message: json.message || 'Backup do Firestore gerado com sucesso!',
        });
        fetchStatus();
      } else {
        setFeedback({ type: 'error', message: json.error || 'Falha ao gerar backup.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Erro ao disparar backup: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (iso?: string) => {
    if (!iso) return 'Nenhum registro';
    try {
      const d = new Date(iso);
      return d.toLocaleString('pt-BR');
    } catch {
      return iso;
    }
  };

  // Indicador de Saúde do Drive
  const driveStatus = statusData?.googleDrive.status;
  const isDriveOk = driveStatus === 'CONNECTED';
  const isDriveError = driveStatus === 'ERROR';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-xl text-white">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Armazenamento & Google Drive</h1>
              <p className="text-sm text-slate-400">
                Gestão integrada de persistência: Google Cloud Firestore, Firebase Storage e Google Drive.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          <a
            href={statusData?.googleDrive.rootFolder.url || 'https://drive.google.com/drive/folders/1270ungaiRH5F_ZjmKFcNCJRHDFbVTosC'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3.5 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium shadow-sm transition"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir Pasta no Drive
          </a>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-lg flex items-start gap-3 border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : feedback.type === 'error'
              ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
              : 'bg-blue-950/40 border-blue-800/60 text-blue-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
          ) : feedback.type === 'error' ? (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-blue-400" />
          )}
          <div className="text-sm font-medium">{feedback.message}</div>
        </div>
      )}

      {/* 3 Cartões de Status de Infraestrutura */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Firestore */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-white shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-amber-400" />
                <span className="font-semibold text-sm tracking-wide">Cloud Firestore</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Conectado
              </span>
            </div>
            <div className="mt-4 space-y-1 text-xs text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Projeto Firebase:</span>
                <span className="font-mono text-slate-200">{statusData?.firebase.projectId || 'bella-top-producao-2'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Papel na Arquitetura:</span>
                <span className="text-amber-300 font-medium">Fonte Única da Verdade</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Tempo Real:</span>
                <span className="text-emerald-400">onSnapshot Ativo</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Zero base64 no banco de dados. Metadados auditáveis.
          </div>
        </div>

        {/* Firebase Storage */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-white shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Cloud className="w-5 h-5 text-cyan-400" />
                <span className="font-semibold text-sm tracking-wide">Firebase Storage</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Conectado
              </span>
            </div>
            <div className="mt-4 space-y-1 text-xs text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Bucket:</span>
                <span className="font-mono text-slate-200 truncate max-w-[180px]">
                  {statusData?.firebaseStorage.bucketName || 'bella-top-producao-2.appspot.com'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Papel:</span>
                <span className="text-cyan-300 font-medium">Retenção e Fallback</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Limite por arquivo:</span>
                <span className="text-slate-200">30 MB</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            Garante zero perda de arquivos durante instabilidade externa.
          </div>
        </div>

        {/* Google Drive */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-white shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <HardDrive className="w-5 h-5 text-blue-400" />
                <span className="font-semibold text-sm tracking-wide">Google Drive Bridge</span>
              </div>
              {isDriveOk ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Conectado
                </span>
              ) : isDriveError ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-900/50 text-rose-300 border border-rose-700/50">
                  <XCircle className="w-3.5 h-3.5" />
                  Indisponível
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-900/50 text-amber-300 border border-amber-700/50">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Aguardando Token
                </span>
              )}
            </div>
            <div className="mt-4 space-y-1 text-xs text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Pasta Raiz:</span>
                <span className="font-semibold text-blue-300">Bella Top - Produção</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">ID da Pasta:</span>
                <span className="font-mono text-slate-200 text-[11px] truncate max-w-[160px]">
                  {statusData?.googleDrive.rootFolder.id || '1270ungaiRH5F_ZjmKFcNCJRHDFbVTosC'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Latência / Resposta:</span>
                <span className="text-slate-200">
                  {statusData?.googleDrive.latencyMs ? `${statusData.googleDrive.latencyMs} ms` : 'Verificado via backend'}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            Tokens e URLs confinados 100% no backend.
          </div>
        </div>
      </div>

      {/* Métricas e Estatísticas de Arquivos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white">
          <div className="text-xs font-medium text-slate-400">Total de Arquivos</div>
          <div className="text-2xl font-bold mt-1 text-white">{statusData?.counts.total || 0}</div>
          <div className="text-[11px] text-slate-400 mt-1">Registrados no sistema</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white">
          <div className="text-xs font-medium text-emerald-400">Enviados ao Drive</div>
          <div className="text-2xl font-bold mt-1 text-emerald-400">{statusData?.counts.enviados || 0}</div>
          <div className="text-[11px] text-slate-400 mt-1">Sincronizados e organizados</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white">
          <div className="text-xs font-medium text-amber-400">Pendentes (Storage)</div>
          <div className="text-2xl font-bold mt-1 text-amber-400">{statusData?.counts.pendentes || 0}</div>
          <div className="text-[11px] text-slate-400 mt-1">Retidos para reprocessamento</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white">
          <div className="text-xs font-medium text-rose-400">Com Erro / Limite</div>
          <div className="text-2xl font-bold mt-1 text-rose-400">{statusData?.counts.erros || 0}</div>
          <div className="text-[11px] text-slate-400 mt-1">Após 3 tentativas de envio</div>
        </div>
      </div>

      {/* Bloco de Ações e Operações Administrativas */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h2 className="text-base font-semibold">Operações de Armazenamento e Repositório</h2>
            <p className="text-xs text-slate-400">
              Ações administrativas exclusivas para provisionamento, fila de sincronização e exportação de backups.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {/* Botão 1: Provisionar */}
          <div className="p-4 bg-slate-800/60 border border-slate-700/70 rounded-xl flex flex-col justify-between">
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-blue-400" />
                Provisionar Estrutura
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Localiza a pasta raiz <strong>Bella Top - Produção</strong> e garante a existência das 7 subpastas oficiais sem duplicar.
              </p>
            </div>
            <button
              onClick={handleProvisionDrive}
              disabled={actionLoading !== null}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition"
            >
              <FolderTree className="w-3.5 h-3.5" />
              {actionLoading === 'provision' ? 'Provisionando...' : 'Provisionar estrutura do Drive'}
            </button>
          </div>

          {/* Botão 2: Reprocessar Fila */}
          <div className="p-4 bg-slate-800/60 border border-slate-700/70 rounded-xl flex flex-col justify-between">
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-amber-400" />
                Reprocessar Fila
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Reprocessa arquivos retidos no Firebase Storage com até 3 tentativas com backoff e idempotência garantida.
              </p>
            </div>
            <button
              onClick={handleRetryPending}
              disabled={actionLoading !== null}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === 'retry' ? 'animate-spin' : ''}`} />
              {actionLoading === 'retry' ? 'Reprocessando...' : 'Reprocessar pendentes'}
            </button>
          </div>

          {/* Botão 3: Fazer Backup */}
          <div className="p-4 bg-slate-800/60 border border-slate-700/70 rounded-xl flex flex-col justify-between">
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                <Archive className="w-4 h-4 text-emerald-400" />
                Backup do Firestore
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Exporta dados operacionais em JSON sanitizado e grava em <strong>00_Backups/AAAA/MM/</strong> e Storage.
              </p>
            </div>
            <button
              onClick={handleCreateBackup}
              disabled={actionLoading !== null}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg transition"
            >
              <Archive className="w-3.5 h-3.5" />
              {actionLoading === 'backup' ? 'Exportando...' : 'Fazer backup agora'}
            </button>
          </div>
        </div>
      </div>

      {/* Cartão de Último Backup & Estrutura de Pastas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Painel do Último Backup */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl text-white">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Archive className="w-4 h-4 text-emerald-400" />
              Último Backup do Sistema
            </div>
            {statusData?.ultimoBackup?.status === 'CONCLUIDO_DRIVE' ? (
              <span className="px-2 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs rounded-full font-medium">
                Concluído no Drive
              </span>
            ) : statusData?.ultimoBackup?.status === 'PENDENTE_DRIVE' ? (
              <span className="px-2 py-0.5 bg-amber-950 border border-amber-800 text-amber-400 text-xs rounded-full font-medium">
                Salvo no Storage
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-full">
                Sem registro
              </span>
            )}
          </div>

          <div className="mt-4 space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Data e Hora:</span>
              <span className="text-slate-200 font-mono">{formatDate(statusData?.ultimoBackup?.data)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Tamanho do Arquivo:</span>
              <span className="text-slate-200 font-mono">{formatBytes(statusData?.ultimoBackup?.tamanho)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Identificador / ID:</span>
              <span className="text-slate-200 font-mono truncate max-w-[200px]">
                {statusData?.ultimoBackup?.id || '—'}
              </span>
            </div>
            {statusData?.ultimoBackup?.driveFileId && (
              <div className="flex justify-between">
                <span className="text-slate-400">Drive File ID:</span>
                <span className="text-blue-400 font-mono truncate max-w-[200px]">
                  {statusData.ultimoBackup.driveFileId}
                </span>
              </div>
            )}
            {statusData?.ultimoBackup?.erro && (
              <div className="p-2.5 mt-2 bg-rose-950/40 border border-rose-900/60 rounded-lg text-rose-300 text-[11px]">
                Aviso: {statusData.ultimoBackup.erro}
              </div>
            )}
          </div>
        </div>

        {/* Visualizador da Estrutura de Pastas do Google Drive */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl text-white">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <FolderTree className="w-4 h-4 text-blue-400" />
              Estrutura Oficial de Diretórios no Drive
            </div>
            <span className="text-[11px] text-blue-400 font-mono">1270ungaiRH5F_ZjmKFcNCJRHDFbVTosC</span>
          </div>

          <div className="mt-3.5 space-y-1.5 text-xs font-mono text-slate-300">
            <div className="flex items-center gap-2 text-blue-400 font-bold">
              📁 Bella Top - Produção/
            </div>
            <div className="pl-4 space-y-1 text-slate-300">
              <div className="flex items-center justify-between hover:text-white py-0.5">
                <span>📁 _Backups do Sistema/</span>
                <span className="text-[11px] text-slate-400">Backups JSON do Firestore</span>
              </div>
              <div className="flex items-center justify-between hover:text-white py-0.5">
                <span>📁 01_OPs/</span>
                <span className="text-[11px] text-slate-400">PDF da OP</span>
              </div>
              <div className="flex items-center justify-between hover:text-white py-0.5">
                <span>📁 02_Layouts/</span>
                <span className="text-[11px] text-slate-400">Layouts e artes técnicas</span>
              </div>
              <div className="flex items-center justify-between hover:text-white py-0.5">
                <span>📁 03_Fotos/</span>
                <span className="text-[11px] text-slate-400">Fotos de produtos e sacolas</span>
              </div>
              <div className="flex items-center justify-between hover:text-white py-0.5">
                <span>📁 04_Qualidade/</span>
                <span className="text-[11px] text-slate-400">Laudos e auditorias técnicas</span>
              </div>
              <div className="flex items-center justify-between hover:text-white py-0.5">
                <span>📁 05_Relatorios/</span>
                <span className="text-[11px] text-slate-400">Fechamentos e relatórios</span>
              </div>
              <div className="flex items-center justify-between hover:text-white py-0.5">
                <span>📁 06_Documentos/</span>
                <span className="text-[11px] text-slate-400">Documentação industrial</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Componente Global de Indicador de Conexão de Armazenamento
 * Exibe no topo do MES:
 * - "Conectado"
 * - "Drive indisponível — salvando no Firebase"
 * - "Sem conexão — fila local pendente"
 */
export const StorageGlobalIndicator: React.FC = () => {
  const [status, setStatus] = useState<'CONNECTED' | 'DRIVE_OFFLINE' | 'OFFLINE'>('CONNECTED');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const checkStatus = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setStatus('OFFLINE');
        return;
      }

      try {
        const res = await fetch('/api/storage/status');
        const json = await res.json();
        if (json.success && json.data) {
          const driveOk = json.data.googleDrive?.status === 'CONNECTED';
          const pend = json.data.counts?.pendentes || 0;
          setPendingCount(pend);

          if (driveOk) {
            setStatus('CONNECTED');
          } else {
            setStatus('DRIVE_OFFLINE');
          }
        }
      } catch {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setStatus('OFFLINE');
        } else {
          setStatus('DRIVE_OFFLINE');
        }
      }
    };

    checkStatus();
    const timer = setInterval(checkStatus, 25000);
    return () => clearInterval(timer);
  }, []);

  if (status === 'OFFLINE') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-900/70 text-rose-200 border border-rose-700/80 shadow-sm animate-pulse">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Sem conexão — fila local pendente</span>
      </div>
    );
  }

  if (status === 'DRIVE_OFFLINE') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/80 text-amber-300 border border-amber-800/80 shadow-sm">
        <Cloud className="w-3.5 h-3.5 text-amber-400" />
        <span>Drive indisponível — salvando no Firebase</span>
        {pendingCount > 0 && (
          <span className="px-1.5 py-0.2 bg-amber-800/80 rounded-full text-[10px] font-bold">
            {pendingCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 shadow-sm">
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
      <span>Conectado</span>
    </div>
  );
};
