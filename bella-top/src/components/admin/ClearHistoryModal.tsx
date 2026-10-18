import React, { useState } from 'react';
import {
  Trash2,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  X,
  Loader2,
  History,
  Bell,
  Layers,
  Activity,
  Check
} from 'lucide-react';
import { useMesStore } from '../../hooks/useMesStore';

interface ClearHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (totalDeleted: number) => void;
}

export const ClearHistoryModal: React.FC<ClearHistoryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { clearHistory, authenticatedUser } = useMesStore();

  // Caixas de seleção: todas marcadas por padrão conforme especificado
  const [selectedOptions, setSelectedOptions] = useState({
    auditoria: true,
    alertas: true,
    ops: true,
    sessoesParadasUploads: true,
  });

  const [confirmInput, setConfirmInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultCounts, setResultCounts] = useState<{
    auditoria: number;
    alertas: number;
    ops: number;
    sessoesMaquina: number;
    paradas: number;
    filaUploads: number;
    total: number;
  } | null>(null);

  if (!isOpen) return null;

  // Validação estrita de perfil: somente admin ou master
  const isAdmin =
    authenticatedUser?.role === 'ADMIN' ||
    (authenticatedUser?.role as string) === 'MASTER' ||
    (authenticatedUser?.sectors && authenticatedUser.sectors.includes('ADMIN'));

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-rose-200 text-center">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-1">Acesso Restrito</h3>
          <p className="text-xs text-gray-600 mb-4">
            Apenas administradores e master têm permissão para acessar a limpeza de histórico do sistema.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  const isConfirmed = confirmInput.trim() === 'APAGAR';
  const hasSelection =
    selectedOptions.auditoria ||
    selectedOptions.alertas ||
    selectedOptions.ops ||
    selectedOptions.sessoesParadasUploads;

  const handleToggle = (key: keyof typeof selectedOptions) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleExecuteClear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfirmed || !hasSelection || isSubmitting) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await clearHistory({
        auditoria: selectedOptions.auditoria,
        alertas: selectedOptions.alertas,
        ops: selectedOptions.ops,
        sessoesParadasUploads: selectedOptions.sessoesParadasUploads,
        confirmation: 'APAGAR',
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Falha ao processar a limpeza do histórico.');
        setIsSubmitting(false);
        return;
      }

      if (res.deletedCounts) {
        setResultCounts(res.deletedCounts);
        if (onSuccess) {
          onSuccess(res.deletedCounts.total);
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro inesperado ao conectar ao servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseAndReload = () => {
    onClose();
    // Pequeno delay para garantir que o estado local foi propagado antes do recarregamento suave
    window.location.reload();
  };

  return (
    <div
      id="clear_history_modal_overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-rose-100 overflow-hidden my-6">
        {/* Cabeçalho de Alerta Crítico */}
        <div className="bg-gradient-to-r from-rose-600 to-rose-700 p-5 sm:p-6 text-white relative">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="absolute top-5 right-5 p-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Trash2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="inline-block text-[10px] font-mono uppercase tracking-widest bg-rose-900/40 px-2 py-0.5 rounded text-rose-100 font-bold mb-0.5">
                Área Administrativa Exclusiva
              </span>
              <h2 className="text-xl font-bold leading-tight">Limpar Histórico do Sistema</h2>
            </div>
          </div>
          <p className="text-xs text-rose-100/90 leading-relaxed max-w-md">
            Esta operação expurga dados operacionais de teste do Firestore em lote (batch) e reseta o cache local.
          </p>
        </div>

        {/* TELA DE SUCESSO / RELATÓRIO DE DELEÇÃO */}
        {resultCounts ? (
          <div className="p-6 space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900">Histórico Limpo com Sucesso!</h3>
              <p className="text-xs text-gray-500 mt-1">
                Foram removidos <strong className="text-rose-600 font-bold">{resultCounts.total}</strong> registro(s) operacionais do banco de dados e do estado local.
              </p>
            </div>

            {/* Quadro de contagem por coleção */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-left space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-gray-200/80">
                <span className="text-gray-600 font-medium">Auditoria e Logins:</span>
                <span className="font-mono font-bold text-gray-900">{resultCounts.auditoria} doc(s)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200/80">
                <span className="text-gray-600 font-medium">Alertas do Sistema:</span>
                <span className="font-mono font-bold text-gray-900">{resultCounts.alertas} doc(s)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200/80">
                <span className="text-gray-600 font-medium">Ordens de Produção (OPs):</span>
                <span className="font-mono font-bold text-gray-900">{resultCounts.ops} doc(s)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-600 font-medium">Sessões, Paradas e Fila Uploads:</span>
                <span className="font-mono font-bold text-gray-900">
                  {resultCounts.sessoesMaquina + resultCounts.paradas + resultCounts.filaUploads} doc(s)
                </span>
              </div>
            </div>

            {/* Aviso de segurança sobre cadastros intactos */}
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-[11px] flex items-center gap-2 text-left">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Tudo seguro:</strong> Usuários, máquinas, produtos, catálogos, roteiros, arquivos e backups continuam 100% preservados.
              </span>
            </div>

            <button
              id="btn_finish_clear_history"
              onClick={handleCloseAndReload}
              className="w-full py-3 bg-[#E30A78] hover:bg-[#c90868] text-white font-bold text-sm rounded-xl shadow-lg transition cursor-pointer"
            >
              Concluir e Atualizar Dados
            </button>
          </div>
        ) : (
          /* FORMULÁRIO DE SELEÇÃO E CONFIRMAÇÃO */
          <form onSubmit={handleExecuteClear} className="p-6 space-y-5">
            {errorMessage && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">Erro ao executar exclusão:</strong>
                  {errorMessage}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                Selecione as coleções a expurgar (todas marcadas por padrão):
              </p>

              <div className="space-y-2.5">
                {/* (1) Histórico de logins e auditoria */}
                <label
                  onClick={() => handleToggle('auditoria')}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedOptions.auditoria
                      ? 'bg-rose-50/60 border-rose-300 text-gray-900'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                      selectedOptions.auditoria ? 'bg-rose-600 text-white' : 'border border-gray-300 bg-white'
                    }`}
                  >
                    {selectedOptions.auditoria && <Check size={14} className="stroke-[3]" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <History size={14} className="text-rose-600" />
                      <span>(1) Histórico de logins e auditoria</span>
                      <span className="text-[10px] font-mono text-gray-500 bg-white px-1.5 py-0.2 rounded border border-gray-200">
                        coleção auditoria
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Apaga os registros de logins, tentativas de acesso e eventos de auditoria passados.
                    </p>
                  </div>
                </label>

                {/* (2) Alertas */}
                <label
                  onClick={() => handleToggle('alertas')}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedOptions.alertas
                      ? 'bg-rose-50/60 border-rose-300 text-gray-900'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                      selectedOptions.alertas ? 'bg-rose-600 text-white' : 'border border-gray-300 bg-white'
                    }`}
                  >
                    {selectedOptions.alertas && <Check size={14} className="stroke-[3]" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Bell size={14} className="text-amber-600" />
                      <span>(2) Alertas do sistema</span>
                      <span className="text-[10px] font-mono text-gray-500 bg-white px-1.5 py-0.2 rounded border border-gray-200">
                        coleção alertas
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Apaga notificações, avisos de parada pendentes e alertas operacionais.
                    </p>
                  </div>
                </label>

                {/* (3) Ordens de Produção de teste */}
                <label
                  onClick={() => handleToggle('ops')}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedOptions.ops
                      ? 'bg-rose-50/60 border-rose-300 text-gray-900'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                      selectedOptions.ops ? 'bg-rose-600 text-white' : 'border border-gray-300 bg-white'
                    }`}
                  >
                    {selectedOptions.ops && <Check size={14} className="stroke-[3]" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Layers size={14} className="text-blue-600" />
                      <span>(3) Ordens de Produção de teste</span>
                      <span className="text-[10px] font-mono text-gray-500 bg-white px-1.5 py-0.2 rounded border border-gray-200">
                        coleção ops
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Apaga todas as OPs de teste e libera as máquinas para ficarem disponíveis.
                    </p>
                  </div>
                </label>

                {/* (4) Sessões de máquina, paradas e fila de uploads */}
                <label
                  onClick={() => handleToggle('sessoesParadasUploads')}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedOptions.sessoesParadasUploads
                      ? 'bg-rose-50/60 border-rose-300 text-gray-900'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                      selectedOptions.sessoesParadasUploads ? 'bg-rose-600 text-white' : 'border border-gray-300 bg-white'
                    }`}
                  >
                    {selectedOptions.sessoesParadasUploads && <Check size={14} className="stroke-[3]" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Activity size={14} className="text-teal-600" />
                      <span>(4) Sessões de máquina, paradas e fila de uploads</span>
                      <span className="text-[10px] font-mono text-gray-500 bg-white px-1.5 py-0.2 rounded border border-gray-200">
                        sessoesMaquina, paradas, filaUploads
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Reseta os registros de paradas operacionais e limpa filas transitórias de uploads.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Quadro de Garantia de Segurança */}
            <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl">
              <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold mb-1">
                <ShieldCheck size={16} className="text-emerald-600" />
                <span>Proteção Absoluta de Cadastros Críticos</span>
              </div>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                <strong>NUNCA apagados:</strong> Usuários, máquinas, produtos, clientes, configurações, setores, processos, regras de roteamento, arquivos e backups.
              </p>
            </div>

            {/* Campo de Confirmação Obrigatória: Digitar APAGAR */}
            <div className="space-y-1.5 pt-1">
              <label
                htmlFor="input_confirm_clear_history"
                className="block text-xs font-bold text-gray-800"
              >
                Para liberar a exclusão, digite a palavra <span className="text-rose-600 font-mono font-black text-sm">APAGAR</span> abaixo:
              </label>
              <input
                id="input_confirm_clear_history"
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="Digite APAGAR"
                autoComplete="off"
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-mono font-bold text-gray-900 focus:bg-white focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 transition-all uppercase placeholder-gray-400"
              />
              <p className="text-[11px] text-gray-500">
                {isConfirmed ? (
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 size={13} /> Palavra de segurança confirmada.
                  </span>
                ) : (
                  <span>O botão abaixo será liberado apenas quando a palavra for digitada exatamente.</span>
                )}
              </p>
            </div>

            {/* Botões de Ação */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                id="btn_confirm_clear_history"
                disabled={!isConfirmed || !hasSelection || isSubmitting}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Excluindo em lote...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Excluir definitivamente</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
