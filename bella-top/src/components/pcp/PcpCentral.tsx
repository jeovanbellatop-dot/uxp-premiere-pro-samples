import React, { useState } from 'react';
import { useMesStore } from '../../hooks/useMesStore';
import {
  FileText,
  Upload,
  Search,
  Filter,
  Layers,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Eye,
  CloudOff,
  X
} from 'lucide-react';
import { PriorityBadge } from '../dashboard/FactoryOverview';
import { PriorityLevel, ProductionOrder } from '../../types/mes';
import { OpProductThumbnail } from '../common/OpProductThumbnail';
import { FullLayoutModal } from './FullLayoutModal';

interface PcpCentralProps {
  onOpenUpload: () => void;
  onSelectOp: (opId: string) => void;
}

export const PcpCentral: React.FC<PcpCentralProps> = ({ onOpenUpload, onSelectOp }) => {
  const { orders, ordersSyncError, clearOrdersSyncError } = useMesStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedLayoutOp, setSelectedLayoutOp] = useState<ProductionOrder | null>(null);

  const filteredOrders = orders.filter((op) => {
    const matchesSearch =
      op.opNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.orderNumber.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPriority = selectedPriority === 'ALL' || op.priority === selectedPriority;
    const matchesStatus = selectedStatus === 'ALL' || op.status === selectedStatus;

    return matchesSearch && matchesPriority && matchesStatus;
  });

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      {/* Aviso real de falha de gravação no servidor.
          Antes esse erro era engolido em silêncio e a OP parecia salva,
          mesmo nunca tendo chegado ao Firestore. */}
      {ordersSyncError && (
        <div
          role="alert"
          className="flex items-start gap-3 bg-rose-50 border border-brand text-brand-deep p-4 rounded-2xl"
        >
          <CloudOff className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Ordem de Produção não gravada no servidor</p>
            <p className="text-xs mt-1 break-words">{ordersSyncError}</p>
            <p className="text-xs mt-1 font-semibold">
              Enquanto isso, a OP existe apenas neste aparelho e não aparece para os operadores.
            </p>
          </div>
          <button
            type="button"
            onClick={clearOrdersSyncError}
            aria-label="Dispensar aviso"
            className="shrink-0 p-1 rounded-lg hover:bg-brand-soft transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-line p-5 rounded-2xl">
        <div>
          <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand" />
            <span>PCP • Central de Planejamento e Controle da Produção</span>
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Gestão de Ordens de Produção com vínculo visual do layout oficial, fotos extraídas e programação.
          </p>
        </div>

        <button
          onClick={onOpenUpload}
          className="px-5 py-2.5 bg-gradient-to-r from-brand to-brand-dark hover:from-brand-dark hover:to-brand-deep text-white font-semibold text-xs rounded-xl shadow-sm shadow-pink-500/20 transition-all flex items-center gap-2 cursor-pointer active:scale-95 shrink-0"
        >
          <Upload className="w-4 h-4 stroke-[2.5]" />
          <span>CARREGAR OP & LAYOUT</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-line p-4 rounded-xl text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por OP, Cliente, Produto, Pedido..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-canvas border border-line text-ink rounded-lg pl-9 pr-3 py-2 text-xs placeholder-faint focus:outline-none focus:border-brand"
          />
        </div>

        {/* Priority Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted text-[11px] font-semibold">Prioridade:</span>
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="bg-canvas border border-line text-ink rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-brand"
          >
            <option value="ALL">Todas as Prioridades</option>
            <option value="VERMELHO">🔴 Vermelho (Urgente)</option>
            <option value="AMARELO">🟡 Amarelo (Atenção)</option>
            <option value="VERDE">🟢 Verde (No Prazo)</option>
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted text-[11px] font-semibold">Status:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-canvas border border-line text-ink rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-brand"
          >
            <option value="ALL">Todos os Status</option>
            <option value="EM_PRODUCAO">Em Produção</option>
            <option value="PROGRAMADA">Programada</option>
            <option value="REVISAO_PCP">Revisão PCP</option>
            <option value="EXPEDICAO">Expedição</option>
            <option value="FINALIZADA">Finalizada</option>
          </select>
        </div>
      </div>

      {/* Main OPs List */}
      <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-canvas text-muted uppercase text-[10px] tracking-wider border-b border-line font-semibold">
              <tr>
                <th className="py-3.5 px-4">Identidade da OP</th>
                <th className="py-3.5 px-4">Cliente</th>
                <th className="py-3.5 px-4">Produto & Especificações</th>
                <th className="py-3.5 px-4">Qtd Planejada</th>
                <th className="py-3.5 px-4">Roteiro / Etapas</th>
                <th className="py-3.5 px-4">Prioridade</th>
                <th className="py-3.5 px-4">Prazo de Entrega</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-medium text-ink-soft">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-subtle text-xs">
                    <p className="font-semibold text-muted text-sm">Nenhuma Ordem de Produção localizada.</p>
                    <p className="mt-1 text-subtle">Utilize o botão "CARREGAR OP & LAYOUT" acima para importar e gerar o roteiro produtivo.</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((op) => {
                const completedSteps = op.steps.filter((s) => s.status === 'FINALIZADA').length;
                const totalSteps = op.steps.length;
                const progressPct = Math.round((completedSteps / totalSteps) * 100);
                const currentStep = op.steps[op.currentStepIndex] || op.steps[0];

                return (
                  <tr
                    key={op.id}
                    onClick={() => onSelectOp(op.id)}
                    className="hover:bg-canvas transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <OpProductThumbnail
                          thumbnail={op.productThumbnail}
                          layoutImage={op.layoutPreviewImage || op.layoutImage}
                          opNumber={op.opNumber}
                          size="sm"
                          onClick={() => setSelectedLayoutOp(op)}
                        />
                        <div>
                          <div className="font-semibold text-ink font-mono text-sm flex items-center gap-1.5">
                            <span>#{op.opNumber}</span>
                          </div>
                          <div className="text-[10px] text-muted font-mono">{op.orderNumber}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-bold text-ink">{op.client}</td>

                    <td className="py-3.5 px-4">
                      <div className="text-ink font-semibold">{op.productName}</div>
                      <div className="text-[11px] text-muted">
                        {op.material} {op.grammage}g • {op.printing?.type || 'Liso'} ({op.printing?.colorsCount || 0} cores)
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono">
                      <div className="font-bold text-ink">
                        {op.targetQuantity.toLocaleString('pt-BR')} {op.unit}
                      </div>
                      <div className="text-[10px] text-emerald-800 font-bold">
                        Bom: {(op.currentGoodQuantity || op.targetQuantity).toLocaleString('pt-BR')}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-hover rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-brand h-full rounded-full"
                            style={{ width: `${progressPct}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] font-mono text-ink-soft">
                          {completedSteps}/{totalSteps}
                        </span>
                      </div>
                      <div className="text-[10px] text-brand-dark font-semibold mt-0.5 truncate max-w-[150px]">
                        Atual: {currentStep?.processName}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <PriorityBadge priority={op.priority} />
                    </td>

                    <td className="py-3.5 px-4 font-mono text-xs">
                      <div className="text-ink">
                        {new Date(op.deadline).toLocaleDateString('pt-BR')}
                      </div>
                      <div
                        className={`text-[10px] font-bold ${
                          op.safetyMarginHours >= 0 ? 'text-emerald-800' : 'text-rose-800'
                        }`}
                      >
                        {op.safetyMarginHours >= 0
                          ? `+${op.safetyMarginHours}h margem`
                          : `${op.safetyMarginHours}h crítico`}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono uppercase ${
                          op.status === 'EM_PRODUCAO'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : op.status === 'PROGRAMADA'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-hover text-ink-soft border border-line'
                        }`}
                      >
                        {op.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLayoutOp(op);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-pink-50 hover:bg-pink-100 text-brand-dark border border-brand-soft text-[11px] font-bold transition-colors inline-flex items-center gap-1"
                        title="Ver Layout Completo"
                      >
                        <Eye className="w-3.5 h-3.5 text-brand" />
                        <span>Layout</span>
                      </button>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full Layout Interactive Modal */}
      {selectedLayoutOp && (
        <FullLayoutModal
          order={selectedLayoutOp}
          isOpen={!!selectedLayoutOp}
          onClose={() => setSelectedLayoutOp(null)}
        />
      )}
    </div>
  );
};
