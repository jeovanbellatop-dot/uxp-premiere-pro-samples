import React, { useState } from 'react';
import { useMesStore } from '../../hooks/useMesStore';
import {
  X,
  FileText,
  Calendar,
  Layers,
  Package,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ZoomIn,
  ShieldCheck,
  Maximize2,
  Info,
  ExternalLink,
  ChevronLeft,
  Tag,
  ArrowRight
} from 'lucide-react';
import { OpProductThumbnail } from '../common/OpProductThumbnail';
import { FullLayoutModal } from './FullLayoutModal';

interface OpDetailModalProps {
  opId: string | null;
  onClose: () => void;
  onSelectMachine?: (machineId: string) => void;
}

export const OpDetailModal: React.FC<OpDetailModalProps> = ({
  opId,
  onClose,
  onSelectMachine,
}) => {
  const { orders, authenticatedUser, allFactoryMachines, getOrderReleaseIssues, updateStepMachine, approveOpRoute } = useMesStore();
  const [isPdfMissingModalOpen, setIsPdfMissingModalOpen] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releaseOk, setReleaseOk] = useState<string | null>(null);
  const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false);

  if (!opId) return null;

  const order = orders.find((o) => o.id === opId);
  if (!order) return null;

  const handleOpenPdf = () => {
    // Verifica se existe PDF real anexado (URL, base64 dataUrl ou arquivo registrado)
    const pdfCandidate = order.op_file || order.sourcePdfName;
    const hasRealPdfUrl = pdfCandidate && (pdfCandidate.startsWith('blob:') || pdfCandidate.startsWith('data:application/pdf') || pdfCandidate.startsWith('http'));

    if (hasRealPdfUrl) {
      window.open(pdfCandidate, '_blank', 'noopener,noreferrer');
    } else if (order.layoutPreviewImage || order.layoutImage) {
      // Se houver imagem/preview de layout oficial
      setIsLayoutModalOpen(true);
    } else {
      // Exibe mensagem amigável sem quebrar a tela
      setIsPdfMissingModalOpen(true);
    }
  };

  const priorityBadgeColor =
    order.priority === 'VERMELHO'
      ? 'bg-rose-100 text-rose-800 border-rose-700'
      : order.priority === 'AMARELO'
      ? 'bg-amber-100 text-amber-800 border-amber-700'
      : 'bg-emerald-100 text-emerald-800 border-emerald-700';

  const priorityLabel =
    order.priority === 'VERMELHO'
      ? 'URGENTE'
      : order.priority === 'AMARELO'
      ? 'ALERTA DE PRAZO'
      : 'DENTRO DO PRAZO';

  const statusLabel =
    order.status === 'EM_PRODUCAO'
      ? 'EM PRODUÇÃO'
      : order.status === 'PROGRAMADA'
      ? 'PROGRAMADA'
      : order.status === 'PAUSADA'
      ? 'PAUSADA'
      : order.status === 'FINALIZADA'
      ? 'CONCLUÍDA'
      : order.status === 'EXPEDICAO'
      ? 'EXPEDIÇÃO'
      : order.status === 'REVISAO_PCP'
      ? 'REVISÃO PCP'
      : order.status;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in">
        <div className="bg-canvas border border-line w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
          
          {/* Header da Consulta da OP */}
          <div className="bg-white px-6 py-4 border-b border-line flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3.5">
              <OpProductThumbnail
                thumbnail={order.productThumbnail}
                layoutImage={order.layoutPreviewImage || order.layoutImage}
                opNumber={order.opNumber}
                size="md"
                interactive={false}
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-sm px-2.5 py-0.5 rounded-lg bg-pink-100 text-brand-dark border border-pink-200">
                    OP #{order.opNumber}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${priorityBadgeColor}`}>
                    {priorityLabel}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-canvas text-ink-soft border border-line">
                    STATUS: {statusLabel}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-ink mt-0.5">
                  {order.productName || 'Não informado na OP'}
                </h2>
                <p className="text-xs text-muted">
                  Cliente: <strong className="text-ink">{order.client || 'Não informado na OP'}</strong>
                </p>
              </div>
            </div>

            {/* Ações do Topo */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenPdf}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-canvas text-ink border border-line text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                title="Abrir arquivo original da Ordem de Produção"
              >
                <FileText className="w-4 h-4 text-brand" />
                <span>Abrir PDF original</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-ink hover:bg-ink-soft text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Voltar</span>
              </button>
            </div>
          </div>

          {/* Conteúdo Principal Somente Leitura */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">

            {/* OP em revisão: o PCP resolve aqui e libera; a fábrica só vê OP liberada */}
            {order.status === 'REVISAO_PCP' && (() => {
              const canRelease =
                authenticatedUser?.role === 'ADMIN' ||
                authenticatedUser?.role === 'MASTER' ||
                authenticatedUser?.role === 'PCP' ||
                Boolean(authenticatedUser?.sectors?.some((sec) => sec === 'ADMIN' || sec === 'PCP'));
              const issues = getOrderReleaseIssues(order);
              const stepsWithoutMachine = order.steps.filter(
                (st) => st.processTypeId !== 'proc_expedicao' && (!st.assignedMachineId || st.needsMachineAllocation)
              );
              return (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-3 text-amber-900">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="text-xs leading-relaxed">
                      <span className="font-bold block">Esta OP ainda não foi liberada para a fábrica</span>
                      Ela não aparece para os operadores até o PCP liberar.
                      {order.revisionNotes && <span className="block mt-1">Motivo: {order.revisionNotes}</span>}
                    </div>
                  </div>

                  {canRelease && stepsWithoutMachine.map((st) => {
                    const options = allFactoryMachines.filter(
                      (m) => m.isActive !== false && m.status !== 'INATIVA' && m.processTypeId === st.processTypeId
                    );
                    return (
                      <label key={st.id} className="flex flex-wrap items-center gap-2 text-xs font-bold">
                        <span>Máquina para "{st.processName}":</span>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            setReleaseError(null);
                            try {
                              updateStepMachine(st.id, e.target.value);
                            } catch (err: any) {
                              setReleaseError(err?.message || 'Máquina não compatível.');
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-ink"
                        >
                          <option value="" disabled>Escolha a máquina</option>
                          {options.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </label>
                    );
                  })}

                  {issues.length > 0 && (
                    <ul className="text-xs list-disc pl-5 space-y-0.5">
                      {issues.map((i) => <li key={i}>{i}</li>)}
                    </ul>
                  )}
                  {releaseError && <p className="text-xs font-bold text-rose-800">{releaseError}</p>}
                  {releaseOk && <p className="text-xs font-bold text-emerald-800">{releaseOk}</p>}

                  {canRelease ? (
                    <button
                      type="button"
                      disabled={issues.length > 0}
                      onClick={() => {
                        setReleaseError(null);
                        try {
                          approveOpRoute(order.id);
                          setReleaseOk(`OP ${order.opNumber} liberada: já aparece na fila da fábrica.`);
                        } catch (err: any) {
                          setReleaseError(err?.message || 'Não foi possível liberar a OP.');
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>LIBERAR PARA PRODUÇÃO</span>
                    </button>
                  ) : (
                    <p className="text-xs">Somente o PCP ou o administrador pode liberar esta OP.</p>
                  )}
                </div>
              );
            })()}
            
            {/* Bloco 1: Grid de Ficha Técnica da OP */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              
              {/* Card 1: Identificação e Prazos */}
              <div className="rounded-2xl border border-line bg-white p-4.5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 border-b border-hover pb-2 text-brand">
                  <FileText className="w-4 h-4" />
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                    Identificação & Prazos
                  </h3>
                </div>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-subtle block text-[11px]">Número da OP:</span>
                    <strong className="text-ink font-mono font-bold text-sm">
                      #{order.opNumber}
                    </strong>
                  </div>
                  <div>
                    <span className="text-subtle block text-[11px]">Número do Pedido:</span>
                    <strong className="text-ink font-mono">
                      {order.orderNumber || 'Não informado na OP'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-subtle block text-[11px]">Cliente:</span>
                    <strong className="text-ink">
                      {order.client || 'Não informado na OP'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-subtle block text-[11px]">Prazo de Entrega:</span>
                    <strong className="text-ink">
                      {order.deadline ? new Date(order.deadline).toLocaleDateString('pt-BR') : 'Não informado na OP'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Card 2: Quantidade e Produto */}
              <div className="rounded-2xl border border-line bg-white p-4.5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 border-b border-hover pb-2 text-brand">
                  <Package className="w-4 h-4" />
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                    Produto & Volume
                  </h3>
                </div>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-subtle block text-[11px]">Produto:</span>
                    <strong className="text-ink">{order.productName || 'Não informado na OP'}</strong>
                  </div>
                  <div>
                    <span className="text-subtle block text-[11px]">Código do Produto:</span>
                    <span className="text-ink-soft font-mono font-bold">
                      {order.productCode || 'Não informado na OP'}
                    </span>
                  </div>
                  <div>
                    <span className="text-subtle block text-[11px]">Quantidade Programada:</span>
                    <strong className="text-emerald-800 font-mono font-bold text-sm">
                      {order.targetQuantity ? `${order.targetQuantity.toLocaleString('pt-BR')} ${order.unit || 'UNIDADES'}` : 'Não informado na OP'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-subtle block text-[11px]">Produzido até o momento:</span>
                    <span className="text-ink-soft font-mono">
                      {order.currentGoodQuantity ? `${order.currentGoodQuantity.toLocaleString('pt-BR')} ${order.unit || 'UNIDADES'}` : '0 ' + (order.unit || 'UNIDADES')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 3: Material & Dimensões */}
              <div className="rounded-2xl border border-line bg-white p-4.5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 border-b border-hover pb-2 text-brand">
                  <Layers className="w-4 h-4" />
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                    Material & Medidas
                  </h3>
                </div>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-subtle block text-[11px]">Material:</span>
                    <strong className="text-ink">{order.material || 'Não informado na OP'}</strong>
                  </div>
                  <div>
                    <span className="text-subtle block text-[11px]">Cor do Material:</span>
                    <strong className="text-ink">
                      {order.color || (order as any).materialColor || 'Não informado na OP'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-subtle block text-[11px]">Gramatura:</span>
                    <strong className="text-ink">
                      {order.grammage ? `${order.grammage} g/m²` : 'Não informado na OP'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-subtle block text-[11px]">Dimensões (L x A + Fundo):</span>
                    <strong className="text-ink font-mono">
                      {order.dimensions
                        ? `${order.dimensions.width} x ${order.dimensions.height}${order.dimensions.gusset ? ` + ${order.dimensions.gusset} mm fundo` : ' mm'}`
                        : 'Não informado na OP'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Card 4: Impressão & Personalização */}
              <div className="rounded-2xl border border-line bg-white p-4.5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 border-b border-hover pb-2 text-brand">
                  <Tag className="w-4 h-4" />
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                    Impressão & Cores
                  </h3>
                </div>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-subtle block text-[11px]">Tipo de Impressão:</span>
                    <strong className="text-ink">
                      {order.printing?.type || 'Não informado na OP'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-subtle block text-[11px]">Quantidade de Cores:</span>
                    <strong className="text-ink">
                      {order.printing?.colorsCount !== undefined && order.printing?.colorsCount !== null
                        ? `${order.printing.colorsCount} cor(es)`
                        : 'Não informado na OP'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-subtle block text-[11px]">Impressão Frente:</span>
                    <span className="text-ink-soft">
                      {order.printing?.front || 'Não informado na OP'}
                    </span>
                  </div>
                  <div>
                    <span className="text-subtle block text-[11px]">Impressão Verso:</span>
                    <span className="text-ink-soft">
                      {order.printing?.back || 'Não informado na OP'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 5: Acessórios & Componentes */}
              <div className="rounded-2xl border border-line bg-white p-4.5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 border-b border-hover pb-2 text-brand">
                  <ShieldCheck className="w-4 h-4" />
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                    Alça & Acessórios
                  </h3>
                </div>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-subtle block text-[11px]">Tipo de Alça:</span>
                    <strong className="text-ink">{order.handleType || 'Não informado na OP'}</strong>
                  </div>
                  <div>
                    <span className="text-subtle block text-[11px]">Uso de Cordão:</span>
                    <strong className={order.hasDrawstring ? 'text-amber-800' : 'text-ink-soft'}>
                      {order.hasDrawstring ? 'Sim (Possui cordão duplo)' : 'Não'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-subtle block text-[11px]">Uso de Visor Cristal:</span>
                    <strong className={order.hasVisor ? 'text-blue-700' : 'text-ink-soft'}>
                      {order.hasVisor ? 'Sim (Visor transparente)' : 'Não'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Card 6: Foto / Layout do Produto */}
              <div className="rounded-2xl border border-line bg-white p-4.5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-hover pb-2 text-brand mb-3">
                    <div className="flex items-center gap-2">
                      <ZoomIn className="w-4 h-4" />
                      <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                        Layout Oficial
                      </h3>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center p-2 bg-canvas rounded-xl border border-line">
                    <OpProductThumbnail
                      thumbnail={order.productThumbnail}
                      layoutImage={order.layoutPreviewImage || order.layoutImage}
                      opNumber={order.opNumber}
                      size="xl"
                      interactive={true}
                      onClick={() => setIsLayoutModalOpen(true)}
                      className="shadow-sm"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsLayoutModalOpen(true)}
                  className="mt-3 w-full py-2 bg-pink-50 hover:bg-pink-100 text-brand-dark text-xs font-bold rounded-xl border border-pink-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Ver Layout em Tela Cheia</span>
                </button>
              </div>

            </div>

            {/* Bloco 2: Observações Técnicas */}
            <div className="rounded-2xl border border-line bg-white p-5 shadow-xs space-y-2">
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-2 text-brand">
                <Info className="w-4 h-4" />
                Observações Técnicas da OP
              </h3>
              <div className="p-3.5 bg-canvas rounded-xl border border-line text-xs text-ink-soft font-medium whitespace-pre-wrap leading-relaxed">
                {order.technicalNotes || 'Não informado na OP.'}
              </div>
            </div>

            {/* Bloco 3: Roteiro de Produção da OP (Somente Leitura) */}
            <div className="rounded-2xl border border-line bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-ink uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-brand" />
                    Roteiro e Etapas de Produção
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    Sequência das etapas fabris programadas para esta ordem.
                  </p>
                </div>
                <span className="text-xs font-bold text-subtle">
                  Total: {order.steps.length} etapa(s)
                </span>
              </div>

              <div className="space-y-3">
                {order.steps.map((step, idx) => {
                  const isDone = step.status === 'FINALIZADA';
                  const isProducing = step.status === 'PRODUZINDO';
                  const isPaused = step.status === 'PAUSADA';
                  const isReady = step.status === 'PRONTA';

                  const stepStatusColor = isDone
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-700'
                    : isProducing
                    ? 'bg-brand text-white border-brand-dark'
                    : isPaused
                    ? 'bg-amber-100 text-amber-800 border-amber-700'
                    : isReady
                    ? 'bg-blue-100 text-blue-800 border-blue-700'
                    : 'bg-canvas text-subtle border-line';

                  const stepStatusLabel = isDone
                    ? 'FINALIZADA'
                    : isProducing
                    ? 'PRODUZINDO'
                    : isPaused
                    ? 'PAUSADA'
                    : isReady
                    ? 'LIBERADA / NA FILA'
                    : 'AGUARDANDO ETAPA ANTERIOR';

                  return (
                    <div
                      key={step.id || idx}
                      className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors ${
                        isProducing
                          ? 'border-brand bg-pink-50/40 shadow-xs'
                          : isDone
                          ? 'border-emerald-200 bg-emerald-50/20'
                          : 'border-line bg-canvas'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white border border-line flex items-center justify-center font-bold text-xs text-ink shrink-0 font-mono shadow-2xs">
                          {idx + 1}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-ink">
                            {step.processName}
                          </h4>
                          <p className="text-xs text-muted flex items-center gap-1.5 mt-0.5">
                            Posto/Máquina: <strong className="text-ink">{step.assignedMachineName || 'Posto Fabril'}</strong>
                            {step.hasCord && (
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-bold">
                                Cordão: SIM
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <div className="text-right text-xs">
                          <span className="text-subtle block text-[11px]">Qtd. Planejada</span>
                          <strong className="text-ink font-mono">
                            {step.plannedQuantity.toLocaleString('pt-BR')} {step.unit}
                          </strong>
                        </div>

                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${stepStatusColor}`}>
                          {stepStatusLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Footer da Modal */}
          <div className="bg-white px-6 py-3.5 border-t border-line flex items-center justify-between shrink-0">
            <div className="text-[11px] text-subtle">
              Criada por {order.createdBy} em {new Date(order.createdAt).toLocaleString('pt-BR')}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-ink hover:bg-ink-soft text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
            >
              Voltar à Tela Anterior
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Aviso quando PDF original não estiver disponível */}
      {isPdfMissingModalOpen && (
        <div className="fixed inset-0 z-60 bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white border border-line w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-500">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <AlertTriangle className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <h3 className="font-bold text-base text-ink">Arquivo PDF</h3>
                <p className="text-xs text-muted">Consulta de Documento</p>
              </div>
            </div>

            <p className="text-xs text-ink-soft leading-relaxed bg-canvas p-3.5 rounded-xl border border-line">
              PDF original não disponível para esta OP.
            </p>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsPdfMissingModalOpen(false)}
                className="px-5 py-2.5 bg-ink hover:bg-ink-soft text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
              >
                OK, Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Layout em Tela Cheia */}
      {isLayoutModalOpen && (
        <FullLayoutModal
          isOpen={isLayoutModalOpen}
          order={order}
          onClose={() => setIsLayoutModalOpen(false)}
        />
      )}
    </>
  );
};
