import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, Flame, AlertTriangle } from 'lucide-react';
import { ProductionUnit, LossClassification, LossDestination } from '../../types/mes';

interface FinishStepModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    producedQuantity: number;
    lossQuantity: number;
    lossReason?: string;
    observation?: string;
    lossClassification?: LossClassification;
    lossDestination?: LossDestination;
    reworkQuantity?: number;
    heldQuantity?: number;
  }) => void;
  machineName: string;
  processName: string;
  opNumber: string;
  receivedQuantity: number;
  unit: ProductionUnit;
}

// Classificacao obrigatoria de perdas - Dossie de Funcionamento cap. 8.1
const LOSS_CLASSIFICATIONS: { value: LossClassification; label: string; hint: string }[] = [
  { value: 'REFUGO', label: 'Refugo', hint: 'Não pode retornar ao processo' },
  { value: 'RETRABALHO', label: 'Retrabalho', hint: 'Pode ser corrigido e retorna a uma etapa' },
  { value: 'SOBRA_REAPROVEITAVEL', label: 'Sobra reaproveitável', hint: 'Material útil fora desta OP' },
  { value: 'TOCO', label: 'Toco', hint: 'Sobra física separada e identificada' },
  { value: 'QUARENTENA', label: 'Quarentena', hint: 'Aguardando decisão da Qualidade' },
];

const LOSS_DESTINATIONS: { value: LossDestination; label: string }[] = [
  { value: 'DESCARTE', label: 'Descarte' },
  { value: 'RETORNO_ETAPA', label: 'Retorno para etapa anterior' },
  { value: 'ESTOQUE_SOBRA', label: 'Estoque de sobra / toco' },
  { value: 'AGUARDANDO_DECISAO', label: 'Aguardando decisão' },
  { value: 'CONCESSAO', label: 'Liberado por concessão' },
];

const COMMON_LOSS_REASONS = [
  'Ajuste inicial de setup e posicionamento',
  'Falha de impressão / borrão de tinta',
  'Solda ultrassônica fraca ou queimada',
  'Refile irregular na borda da bobina',
  'Puxamento desalinhado na esteira',
  'Material com defeito de fábrica do fornecedor',
  'Alça fita curta ou com solda solta',
  'Outro motivo de perda',
];

export const FinishStepModal: React.FC<FinishStepModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  machineName,
  processName,
  opNumber,
  receivedQuantity,
  unit,
}) => {
  const [producedQuantity, setProducedQuantity] = useState<number>(receivedQuantity || 1000);
  const [lossQuantity, setLossQuantity] = useState<number>(0);
  const [lossReason, setLossReason] = useState<string>(COMMON_LOSS_REASONS[0]);
  const [observation, setObservation] = useState<string>('');
  const [lossClassification, setLossClassification] = useState<LossClassification>('REFUGO');
  const [lossDestination, setLossDestination] = useState<LossDestination>('DESCARTE');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset e sincronização ao abrir o modal
  useEffect(() => {
    if (isOpen) {
      setProducedQuantity(receivedQuantity > 0 ? receivedQuantity : 1000);
      setLossQuantity(0);
      setLossReason(COMMON_LOSS_REASONS[0]);
      setObservation('');
      setLossClassification('REFUGO');
      setLossDestination('DESCARTE');
      setErrorMsg(null);
    }
  }, [isOpen, receivedQuantity]);

  if (!isOpen) return null;

  const goodQuantity = Math.max(0, producedQuantity - lossQuantity);
  const lossPercentage = producedQuantity > 0 ? ((lossQuantity / producedQuantity) * 100).toFixed(1) : '0.0';

  const handleClose = () => {
    setErrorMsg(null);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (producedQuantity <= 0) {
      setErrorMsg('A quantidade total produzida deve ser maior que zero.');
      return;
    }
    if (lossQuantity < 0) {
      setErrorMsg('A quantidade de perda não pode ser negativa.');
      return;
    }
    if (lossQuantity > producedQuantity) {
      setErrorMsg('A perda informada não pode ser maior do que a quantidade produzida.');
      return;
    }
    if (lossQuantity > 0 && !lossReason.trim()) {
      setErrorMsg('Selecione ou informe o motivo da perda.');
      return;
    }

    try {
      onConfirm({
        producedQuantity,
        lossQuantity,
        lossReason: lossQuantity > 0 ? lossReason.trim() : undefined,
        observation: observation.trim() || undefined,
        lossClassification: lossQuantity > 0 ? lossClassification : undefined,
        lossDestination: lossQuantity > 0 ? lossDestination : undefined,
        reworkQuantity: lossQuantity > 0 && lossClassification === 'RETRABALHO' ? lossQuantity : undefined,
        heldQuantity: lossQuantity > 0 && lossClassification === 'QUARENTENA' ? lossQuantity : undefined,
      });
      handleClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao finalizar etapa.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-canvas/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-white border border-line w-full max-w-xl rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="bg-canvas px-4 sm:px-6 py-4 border-b border-line flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-700 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-ink">
                Finalizar Etapa & Apontar Produção
              </h3>
              <p className="text-xs text-muted">
                Processo: <span className="text-amber-800 font-semibold">{processName}</span> ({machineName}) • OP #{opNumber}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-hover"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span className="font-semibold text-xs">{errorMsg}</span>
            </div>
          )}

          {/* Batch Received Info */}
          <div className="p-3 bg-canvas rounded-xl border border-line flex items-center justify-between font-mono">
            <span className="text-muted text-xs">Quantidade Recebida da Etapa Anterior:</span>
            <span className="text-ink font-bold text-sm">
              {receivedQuantity.toLocaleString('pt-BR')} {unit}
            </span>
          </div>

          {/* Numbers Grid: Produced vs Loss */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-ink-soft font-bold uppercase text-[11px] block">
                1. Quantidade Total Produzida ({unit})
              </label>
              <input
                type="number"
                  inputMode="numeric"
                min="1"
                required
                value={producedQuantity === 0 ? '' : producedQuantity}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                  setProducedQuantity(val);
                }}
                className="w-full bg-canvas border border-line rounded-xl p-3 text-lg font-mono font-bold text-ink focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-rose-700 font-bold uppercase text-[11px] block flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-rose-600" />
                2. Quantidade Perdida / Refugos
              </label>
              <input
                type="number"
                  inputMode="numeric"
                min="0"
                max={producedQuantity}
                placeholder="0 (sem perda)"
                aria-label="Quantidade perdida"
                value={lossQuantity === 0 ? '' : lossQuantity}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                  setLossQuantity(val);
                }}
                className="w-full bg-canvas border border-rose-700 rounded-xl p-3 text-lg font-mono font-bold text-rose-700 focus:outline-none focus:border-rose-600"
              />
            </div>
          </div>

          {/* Critical Loss Propagation Formula Banner (Section 25 & 27) */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-canvas to-white border border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted font-semibold block">
                Saldo Bom Resultante (Liberado para próxima máquina):
              </span>
              <div className="text-xl font-bold font-mono text-emerald-700 mt-0.5">
                {goodQuantity.toLocaleString('pt-BR')} {unit}
                {lossQuantity > 0 && (
                  <span className="text-xs text-rose-700 font-normal font-sans ml-2">
                    (-{lossQuantity} un / {lossPercentage}% perda)
                  </span>
                )}
              </div>
            </div>

            <div className="hidden sm:block text-[10px] text-muted bg-white px-3 py-1.5 rounded-lg border border-line max-w-xs">
              🔒 <span className="text-ink-soft font-semibold">Regra de Chão de Fábrica:</span> As perdas não avançam para a próxima máquina.
            </div>
          </div>

          {/* Loss Reason (if loss > 0) */}
          {lossQuantity > 0 && (
            <div className="space-y-2 pt-1">
              <label className="text-ink-soft font-semibold text-xs block">
                Motivo da Perda nesta Etapa ({processName}):
              </label>
              <select
                value={lossReason}
                onChange={(e) => setLossReason(e.target.value)}
                className="w-full bg-canvas border border-line rounded-xl p-2.5 text-ink text-xs focus:outline-none focus:border-brand"
              >
                {COMMON_LOSS_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              {/* Classificacao e destino da perda - Dossie cap. 8.1 / 11.1 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-ink-soft font-semibold text-xs block">Classificação da perda:</label>
                  <select
                    value={lossClassification}
                    onChange={(e) => setLossClassification(e.target.value as LossClassification)}
                    className="w-full bg-canvas border border-line rounded-xl p-2.5 text-ink text-xs focus:outline-none focus:border-brand"
                  >
                    {LOSS_CLASSIFICATIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted">
                    {LOSS_CLASSIFICATIONS.find((c) => c.value === lossClassification)?.hint}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-ink-soft font-semibold text-xs block">Destino do material:</label>
                  <select
                    value={lossDestination}
                    onChange={(e) => setLossDestination(e.target.value as LossDestination)}
                    className="w-full bg-canvas border border-line rounded-xl p-2.5 text-ink text-xs focus:outline-none focus:border-brand"
                  >
                    {LOSS_DESTINATIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted">Registro obrigatório: motivo, quantidade, unidade e destino.</p>
                </div>
              </div>
            </div>
          )}

          {/* Observation */}
          <div className="space-y-1">
            <label className="text-muted text-xs">Observação Técnica (Opcional):</label>
            <input
              type="text"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Ex: Lote concluído sem variações dimensionais..."
              className="w-full bg-canvas border border-line rounded-lg p-2.5 text-ink focus:outline-none focus:border-brand"
            />
          </div>

          {/* Footer buttons */}
          <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-white border-t border-line grid grid-cols-2 gap-3 items-center">
            <button
              type="button"
              onClick={handleClose}
              className="min-h-12 w-full px-4 rounded-xl bg-hover hover:bg-line text-ink-soft font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="min-h-12 w-full px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
              <span>FINALIZAR ETAPA & LIBERAR LOTE</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
