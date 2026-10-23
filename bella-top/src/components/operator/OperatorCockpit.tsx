import React, { useEffect, useState } from 'react';
import { useMesStore } from '../../hooks/useMesStore';
import { getUserOperatedMachineNames, isPrivilegedUser } from '../../utils/userMachines';
import {
  Play,
  Pause,
  CheckCircle,
  Clock,
  Inbox,
  ListOrdered,
  ChevronRight,
  AlertTriangle,
  UserCheck,
  Cpu,
  Eye,
  LogOut,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Shield,
  RefreshCw
} from 'lucide-react';
import { PauseModal } from './PauseModal';
import { FinishStepModal } from './FinishStepModal';
import { OpProductThumbnail } from '../common/OpProductThumbnail';
import { FullLayoutModal } from '../pcp/FullLayoutModal';
import { ExpeditionCockpit } from './ExpeditionCockpit';
import { MachineStationLogin } from './MachineStationLogin';
import { CorteSoldaQueue } from './CorteSoldaQueue';
import { ProductionOrder, MachineSession } from '../../types/mes';

interface OperatorCockpitProps {
  initialMachineId?: string;
  initialTab?: 'production' | 'queue';
  onSelectOp: (opId: string) => void;
  onReturnToDashboard?: () => void;
}

export const OperatorCockpit: React.FC<OperatorCockpitProps> = ({
  initialMachineId,
  initialTab,
  onSelectOp,
  onReturnToDashboard,
}) => {
  const {
    machines,
    allFactoryMachines,
    orders,
    currentUser,
    authenticatedUser,
    selectedSector,
    activeOperatorMachineId,
    getMachinesForUser,
    getMachineSession,
    logoutMachineOperator,
    logout,
    startOperation,
    pauseOperation,
    resumeOperation,
    finishOperation,
    getMachineQueue,
  } = useMesStore();

  const activeUser = authenticatedUser || currentUser;
  const effectiveSector = selectedSector || activeUser?.sectors?.[0] || 'CORTE_SOLDA';

  // Obtém lista de máquinas do parque fabril disponíveis para visualização/operação
  const userMachines = getMachinesForUser(activeUser, effectiveSector);
  // Gestão (Admin/Master/PCP/Gestor) vê o parque todo; operador vê SÓ as máquinas cadastradas para ele.
  const isAdminSession = isPrivilegedUser(activeUser);
  const isOperatorBound = !isAdminSession;
  const allMachinesList = allFactoryMachines.length > 0 ? allFactoryMachines : machines;
  const factoryMachines = isAdminSession ? allMachinesList : userMachines;
  const displayMachines = isAdminSession ? (userMachines.length > 0 ? userMachines : allMachinesList) : userMachines;

  const [selectedMachineId, setSelectedMachineId] = useState(
    isOperatorBound && activeOperatorMachineId
      ? activeOperatorMachineId
      : initialMachineId && displayMachines.some((m) => m.id === initialMachineId)
      ? initialMachineId
      : displayMachines[0]?.id || 'm3-corte-solda'
  );

  useEffect(() => {
    if (isOperatorBound && activeOperatorMachineId && displayMachines.some((m) => m.id === activeOperatorMachineId)) {
      setSelectedMachineId(activeOperatorMachineId);
    } else if (initialMachineId && factoryMachines.some((m) => m.id === initialMachineId)) {
      setSelectedMachineId(initialMachineId);
    } else if (!displayMachines.some((m) => m.id === selectedMachineId)) {
      setSelectedMachineId(displayMachines[0]?.id || factoryMachines[0]?.id || '');
    }
  }, [displayMachines, factoryMachines, initialMachineId, isOperatorBound, activeOperatorMachineId]);

  const activeMachine = displayMachines.find((m) => m.id === selectedMachineId) || factoryMachines.find((m) => m.id === selectedMachineId && isAdminSession) || displayMachines[0];
  const machineSession = activeMachine ? getMachineSession(activeMachine.id) : null;

  const [activeTab, setActiveTab] = useState<'production' | 'queue'>(initialTab || 'production');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [selectedQueueStepId, setSelectedQueueStepId] = useState<string | null>(null);
  const [isPauseModalOpen, setIsPauseModalOpen] = useState(false);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [secondsRunning, setSecondsRunning] = useState(0);
  const [selectedLayoutOp, setSelectedLayoutOp] = useState<ProductionOrder | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationSuccess, setOperationSuccess] = useState<string | null>(null);
  // Detalhes secundarios ficam recolhidos no celular (tela limpa para o operador).
  const [showDetails, setShowDetails] = useState(false);

  const machineQueue = activeMachine ? getMachineQueue(activeMachine.id) : [];
  // Duas filas: o que já pode começar aqui e o que ainda está em etapas anteriores.
  const readyQueue = machineQueue.filter((item) => item.ready);
  const upcomingQueue = machineQueue.filter((item) => !item.ready);
  const selectedQueueItem = readyQueue.find((item) => item.step.id === selectedQueueStepId);
  const currentOp = orders.find((order) => order.id === activeMachine?.currentOpId);
  // A etapa so conta como "em producao nesta maquina" enquanto nao estiver finalizada.
  // Sem esta checagem, um cadastro de maquina desatualizado (currentOpId antigo) fazia a
  // OP finalizada VOLTAR para o operador, em vez de seguir para a proxima maquina do roteiro.
  const currentStepCandidate = currentOp?.steps.find((step) => step.id === activeMachine?.currentOperationId);
  const currentStep =
    currentStepCandidate && currentStepCandidate.status !== 'FINALIZADA'
      ? currentStepCandidate
      : undefined;
  const isProducing = activeMachine?.status === 'PRODUZINDO';
  const isPaused = activeMachine?.status === 'PAUSADA';

  const isCorteSoldaSector =
    activeMachine?.sector === 'Corte e Solda' ||
    activeMachine?.sector === 'CORTE_SOLDA' ||
    (activeMachine?.code && activeMachine.code.startsWith('CS'));

  const calculatedEstimatedMinutes = currentStep
    ? currentStep.estimatedMinutes ||
      (activeMachine.productionUnit === 'METROS'
        ? currentStep.receivedQuantity / Math.max(1, activeMachine.nominalSpeed)
        : (currentStep.receivedQuantity / Math.max(1, activeMachine.nominalSpeed)) * 60)
    : 0;
  const estimatedSeconds = Math.max(60, Math.round(calculatedEstimatedMinutes * 60));
  const productionProgress = currentStep ? Math.min(100, Math.round((secondsRunning / estimatedSeconds) * 100)) : 0;

  useEffect(() => {
    if (!isProducing || !currentStep?.actualStartTime) {
      setSecondsRunning(0);
      return;
    }
    const start = new Date(currentStep.actualStartTime).getTime();
    const update = () => setSecondsRunning(Math.floor((Date.now() - start) / 1000));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [isProducing, currentStep?.actualStartTime]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map((value) => String(value).padStart(2, '0')).join(':');
  };

  const priorityStyle = (priority: string) =>
    priority === 'VERMELHO'
      ? { label: 'URGENTE', dot: 'bg-rose-500', card: 'border-rose-500/60 bg-rose-50', badge: 'bg-rose-600 text-white' }
      : priority === 'AMARELO'
      ? { label: 'ALERTA', dot: 'bg-amber-500', card: 'border-amber-500/50 bg-amber-50', badge: 'bg-amber-500 text-white' }
      : { label: 'NO PRAZO', dot: 'bg-emerald-500', card: 'border-emerald-500/40 bg-emerald-50', badge: 'bg-emerald-600 text-white' };

  const isExpedicaoSector = effectiveSector === 'EXPEDICAO' || (!displayMachines.length && activeUser?.sectors?.includes('EXPEDICAO'));

  if (isExpedicaoSector) {
    return <ExpeditionCockpit onSelectOp={onSelectOp} />;
  }

  if (!activeMachine) {
    return (
      <div className="max-w-xl mx-auto mt-16 rounded-3xl border border-[#E5DAD3] bg-white p-10 text-center">
        <Inbox className="w-12 h-12 text-[#9A8B84] mx-auto mb-4" />
        <h2 className="text-xl font-bold">Nenhuma máquina disponível</h2>
        <p className="text-sm text-[#6E615B] mt-2">Seu usuário não tem máquina cadastrada. Procure o administrador para vincular a sua máquina.</p>
      </div>
    );
  }

  const handleLogoutMachine = () => {
    logoutMachineOperator(activeMachine.id);
  };

  // Sair: libera a máquina (se houver operador) e encerra a sessão do sistema.
  const handleExit = () => {
    if (!window.confirm('Deseja sair do sistema?')) return;
    if (machineSession) logoutMachineOperator(activeMachine.id);
    if (logout) logout();
  };

  const currentActorId = machineSession?.operatorId || (isAdminSession ? authenticatedUser?.id : undefined);

  const startSelectedOp = (stepIdToStart?: string) => {
    setOperationError(null);
    const targetStepId = stepIdToStart || selectedQueueItem?.step.id;
    if (!targetStepId) return;
    try {
      startOperation(targetStepId, activeMachine.id, currentActorId);
      // Iniciada: sai da fila (para todos) e vai para a aba "Em produção".
      setSelectedQueueStepId(null);
      setOperationSuccess('Operação iniciada com sucesso!');
      setActiveTab('production');
      setTimeout(() => setOperationSuccess(null), 4000);
    } catch (err: any) {
      setOperationError(err?.message || 'Erro ao iniciar operação');
    }
  };

  const handleResumeOp = () => {
    if (!currentStep) return;
    setOperationError(null);
    try {
      resumeOperation(currentStep.id, activeMachine.id, currentActorId);
      setOperationSuccess('Operação retomada com sucesso!');
      setTimeout(() => setOperationSuccess(null), 4000);
    } catch (err: any) {
      setOperationError(err?.message || 'Erro ao retomar operação');
    }
  };

  const handlePauseOp = (reason: string) => {
    if (!currentStep) return;
    setOperationError(null);
    try {
      pauseOperation(currentStep.id, reason, activeMachine.id, currentActorId);
      setOperationSuccess('Pausa registrada com sucesso!');
      setTimeout(() => setOperationSuccess(null), 4000);
    } catch (err: any) {
      setOperationError(err?.message || 'Erro ao registrar pausa');
    }
  };

  const handleFinishOp = (data: any) => {
    if (!currentStep) return;
    setOperationError(null);
    try {
      finishOperation(currentStep.id, data, activeMachine.id, currentActorId);
      setOperationSuccess('Etapa finalizada e saldo liberado com sucesso!');
      setTimeout(() => setOperationSuccess(null), 4000);
    } catch (err: any) {
      setOperationError(err?.message || 'Erro ao finalizar etapa');
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-16 space-y-4 sm:space-y-5 px-3 sm:px-0">
      {/* TELA DE IDENTIFICAÇÃO - Exibida apenas para operadores comuns quando a máquina não tiver sessão ativa */}
      {!isAdminSession && !machineSession ? (
        <MachineStationLogin
          machine={activeMachine}
          onLoginSuccess={() => {
            // Sessão iniciada com sucesso
          }}
          onSelectAnotherMachine={() => {
            // Seleciona a primeira máquina ativa de corte e solda (M2, M3 ou M4)
            const activeCs = factoryMachines.find(
              (m) => m.sector === 'Corte e Solda' && m.status !== 'INATIVA' && m.id !== 'm1-corte-solda'
            );
            if (activeCs) setSelectedMachineId(activeCs.id);
          }}
        />
      ) : (
        /* ÁREA OPERACIONAL IDENTIFICADA OU ACESSO ADMINISTRATIVO */
        <div className="space-y-3">
          {/* Barra superior fixa: Voltar · Posto · Sair */}
          <header className="sticky top-0 z-20 -mx-3 sm:mx-0 px-3 sm:px-4 py-2.5 bg-white/95 backdrop-blur border-b sm:border sm:rounded-2xl border-[#EFE6E0] flex items-center justify-between gap-2">
            {onReturnToDashboard ? (
              <button
                onClick={onReturnToDashboard}
                className="shrink-0 h-9 px-2.5 rounded-lg text-[#3A3034] hover:bg-[#F4EEEA] text-xs font-bold flex items-center gap-1 cursor-pointer"
                title="Voltar ao painel"
              >
                <ArrowLeft size={16} />
                <span>Voltar</span>
              </button>
            ) : (
              <span className="w-16 shrink-0" />
            )}

            <div className="min-w-0 text-center">
              <p className="text-sm font-black text-[#1C1418] truncate">
                <span className="font-mono text-[#8A7D77] mr-1">{activeMachine.code}</span>
                {activeMachine.name}
              </p>
              <p className="text-[11px] text-[#8A7D77] truncate flex items-center justify-center gap-1">
                <span
                  className={
                    'inline-block w-1.5 h-1.5 rounded-full ' +
                    (isProducing ? 'bg-emerald-500' : isPaused ? 'bg-amber-500' : 'bg-[#C9BCB5]')
                  }
                />
                {activeMachine.status}
                {' · '}
                {isAdminSession ? 'ADM' : machineSession?.operatorName || 'Operador'}
                {machineSession?.loginTime && (
                  <span className="hidden sm:inline">
                    {' · entrada ' + new Date(machineSession.loginTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </p>
            </div>

            <button
              id="btn_logout_machine_operator"
              onClick={handleExit}
              className="shrink-0 h-9 px-2.5 rounded-lg text-rose-600 hover:bg-rose-50 text-xs font-bold flex items-center gap-1 cursor-pointer"
              title="Sair"
            >
              <LogOut size={16} />
              <span>Sair</span>
            </button>
          </header>

          {/* Troca rápida de máquina (ADM) */}
          {isAdminSession && factoryMachines.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 pb-0.5">
              {factoryMachines.map((m) => {
                const isSelected = m.id === activeMachine.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMachineId(m.id)}
                    className={
                      'shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ' +
                      (isSelected
                        ? 'bg-[#1C1418] text-white'
                        : 'bg-white text-[#6E615B] border border-[#EFE6E0] hover:text-[#1C1418]')
                    }
                  >
                    <span className="font-mono">{m.code}</span>
                    <span>{m.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Feedback Banners */}
          {operationError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-sm font-bold flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>{operationError}</span>
              </div>
              <button
                onClick={() => setOperationError(null)}
                className="p-1 rounded-lg hover:bg-rose-100 text-rose-600"
              >
                ✕
              </button>
            </div>
          )}

          {operationSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-sm font-bold flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{operationSuccess}</span>
              </div>
              <button
                onClick={() => setOperationSuccess(null)}
                className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-600"
              >
                ✕
              </button>
            </div>
          )}

          {/* Abas: Produção x Fila */}
          <div className="flex gap-1 rounded-xl bg-[#F4EEEA] p-1">
            <button
              onClick={() => setActiveTab('production')}
              className={
                'flex-1 rounded-lg px-3 py-2 text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ' +
                (activeTab === 'production' ? 'bg-white text-[#E30A78] shadow-sm' : 'text-[#6E615B] hover:text-[#1C1418]')
              }
            >
              <Play className="w-4 h-4" />
              Em produção
            </button>
            <button
              onClick={() => setActiveTab('queue')}
              className={
                'flex-1 rounded-lg px-3 py-2 text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ' +
                (activeTab === 'queue' ? 'bg-white text-[#E30A78] shadow-sm' : 'text-[#6E615B] hover:text-[#1C1418]')
              }
            >
              <ListOrdered className="w-4 h-4" />
              {isCorteSoldaSector ? 'Fila C&S' : 'Fila'}
              {readyQueue.length > 0 && (
                <span className="rounded-full bg-[#E30A78] text-white px-1.5 text-[10px] leading-4">{readyQueue.length}</span>
              )}
            </button>
          </div>

          {/* ABA DE PRODUÇÃO (Cronômetro, Perdas, Saldo, Roteiro, etc. - 100% PRESERVADOS) */}
          {activeTab === 'production' &&
            (currentOp && currentStep ? (
              <section className="rounded-3xl border border-[#E5DAD3] bg-white p-4 sm:p-8 space-y-4 sm:space-y-6 shadow-xs">
                {/* Header with Bag Photo and OP Details */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-pink-50/60 to-white border border-[#F5C6DC]">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <OpProductThumbnail
                      thumbnail={currentOp.productThumbnail}
                      layoutImage={currentOp.layoutPreviewImage || currentOp.layoutImage}
                      opNumber={currentOp.opNumber}
                      size="hero"
                      onClick={() => onSelectOp(currentOp.id)}
                      className="shadow-md border-2 border-[#E30A78]/30 cursor-pointer"
                    />
                    <div
                      onClick={() => onSelectOp(currentOp.id)}
                      className="cursor-pointer hover:opacity-95 transition-opacity"
                      title="Clique para ver os detalhes completos da OP"
                    >
                      <p className="text-[10px] uppercase font-bold text-[#8A7D77] tracking-wider">
                        ORDEM EM PRODUÇÃO NESTA MÁQUINA
                      </p>
                      <h2 className="text-2xl sm:text-3xl font-black text-[#1C1418] flex items-center gap-2 hover:text-[#E30A78] transition-colors">
                        <span>OP #{currentOp.opNumber}</span>
                      </h2>
                      <p className="text-sm font-semibold text-[#B30A5C] mt-0.5">{currentOp.productName}</p>
                      <p className="text-xs text-[#6E615B]">
                        Cliente: <strong>{currentOp.client}</strong> · Operador:{' '}
                        <strong>{currentStep.activeOperatorName || machineSession.operatorName}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedLayoutOp(currentOp)}
                      className="flex-1 min-h-11 px-3.5 py-2 rounded-xl bg-white border border-[#E5DAD3] hover:border-[#B30A5C] text-xs font-bold text-[#1C1418] hover:text-[#B30A5C] flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <Eye className="w-4 h-4 text-[#B30A5C]" />
                      <span>Ver Layout Completo</span>
                    </button>
                    <button
                      onClick={() => onSelectOp(currentOp.id)}
                      className="flex-1 min-h-11 px-3 py-2 rounded-xl border border-[#E5DAD3] bg-white text-xs font-bold text-[#1C1418] hover:bg-[#FAF5F1] transition cursor-pointer"
                    >
                      Detalhes da OP
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-2xl bg-[#FAF5F1] p-4">
                    <p className="text-xs text-[#8A7D77]">ETAPA</p>
                    <p className="font-bold mt-1 text-[#1C1418]">{currentStep.processName}</p>
                    {(currentStep.hasCord ||
                      (currentStep.processTypeId === 'proc_solda' && currentOp.hasDrawstring)) && (
                      <span className="inline-block mt-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-300 font-extrabold">
                        Cordão: SIM (Corte + Solda + Cordão)
                      </span>
                    )}
                  </div>
                  <div className="rounded-2xl bg-[#FAF5F1] p-4">
                    <p className="text-xs text-[#8A7D77]">QUANTIDADE</p>
                    <p className="font-bold mt-1 text-[#1C1418]">
                      {currentStep.receivedQuantity.toLocaleString('pt-BR')} {currentStep.unit}
                    </p>
                  </div>
                  <div className={"rounded-2xl bg-[#FAF5F1] p-4 sm:block " + (showDetails ? "" : "hidden")}>
                    <p className="text-xs text-[#8A7D77] flex items-center gap-1">
                      <Clock className="w-3 h-3" /> TEMPO DECORRIDO
                    </p>
                    <p className="font-mono font-bold text-[#E30A78] mt-1">
                      {isPaused ? 'PAUSADO' : formatTime(secondsRunning)}
                    </p>
                    <p className="text-[10px] text-[#9A8B84] mt-1">Contagem crescente</p>
                  </div>
                  <div className={"rounded-2xl bg-[#FAF5F1] p-4 sm:block " + (showDetails ? "" : "hidden")}>
                    <p className="text-xs text-[#8A7D77]">ESTIMATIVA TOTAL</p>
                    <p className="font-mono font-bold text-cyan-700 mt-1">{formatTime(estimatedSeconds)}</p>
                    <p className="text-[10px] text-[#9A8B84] mt-1">{productionProgress}% estimado</p>
                  </div>
                </div>

                {/* No celular, os dados secundarios ficam recolhidos ate o operador pedir */}
                <button
                  type="button"
                  onClick={() => setShowDetails((prev) => !prev)}
                  className="sm:hidden w-full min-h-11 rounded-2xl border border-[#E5DAD3] bg-white text-xs font-bold text-[#6E615B] flex items-center justify-center gap-2 cursor-pointer"
                >
                  {showDetails ? "Ocultar detalhes" : "Ver detalhes"}
                </button>

                {isPaused && (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-700 flex gap-2">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
                    <span>{activeMachine.currentPauseReason || 'Produção pausada'}</span>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-3">
                  {isProducing && (
                    <button
                      onClick={() => setIsPauseModalOpen(true)}
                      className="min-h-16 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <Pause className="w-6 h-6" /> PAUSAR
                    </button>
                  )}
                  {isPaused && (
                    <button
                      onClick={() => handleResumeOp()}
                      className="min-h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <Play className="w-6 h-6" /> RETOMAR
                    </button>
                  )}
                  <button
                    onClick={() => setIsFinishModalOpen(true)}
                    className="min-h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base flex items-center justify-center gap-2 cursor-pointer border border-emerald-700/20 shadow-sm transition-colors"
                  >
                    <CheckCircle className="w-6 h-6 text-white" /> FINALIZAR ETAPA
                  </button>
                </div>
              </section>
            ) : (
            /* NENHUMA OP EM PRODUÇÃO */
            <section className="space-y-3">
              <div className="flex items-center gap-3 rounded-2xl bg-white border border-[#EFE6E0] px-4 py-3">
                <Inbox className="w-5 h-5 text-[#9A8B84] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#1C1418]">Nenhuma OP em produção</p>
                  <p className="text-xs text-[#8A7D77]">
                    {isCorteSoldaSector ? 'Escolha a próxima OP na fila abaixo.' : 'Abra a fila para selecionar o próximo trabalho.'}
                  </p>
                </div>
                {!isCorteSoldaSector && readyQueue.length > 0 && (
                  <button
                    onClick={() => setActiveTab('queue')}
                    className="shrink-0 text-xs font-black text-[#E30A78] hover:text-[#B30A5C] cursor-pointer"
                  >
                    Ver fila ({readyQueue.length}) →
                  </button>
                )}
              </div>
              {isCorteSoldaSector && (
                <CorteSoldaQueue
                  machine={activeMachine}
                  session={machineSession}
                  onSelectOp={onSelectOp}
                  onStartOp={(stepId) => startSelectedOp(stepId)}
                />
              )}
            </section>
            ))}

          {/* ABA DE FILA (FILA COMPARTILHADA PARA CORTE E SOLDA OU FILA PADRÃO PARA OUTROS SETORES) */}
          {activeTab === 'queue' && (
            isCorteSoldaSector ? (
              <CorteSoldaQueue
                machine={activeMachine}
                session={machineSession}
                onSelectOp={onSelectOp}
                onStartOp={(stepId) => startSelectedOp(stepId)}
              />
            ) : (
              <section className="rounded-3xl border border-[#E5DAD3] bg-white p-4 sm:p-6 shadow-xs">
                <div>
                  <h2 className="text-xl font-black text-[#1C1418]">Fila de OPs • {activeMachine.name}</h2>
                  <p className="text-sm text-[#6E615B] mt-1">Selecione uma OP para iniciar nesta máquina.</p>
                </div>
                {selectedQueueItem ? (
                  <div className="mt-5 rounded-3xl border border-pink-300 bg-pink-50/50 p-4 sm:p-8">
                    <p className="text-xs font-black tracking-widest text-[#B30A5C]">OP SELECIONADA PARA INICIAR</p>
                    <div className="mt-4 flex flex-col sm:flex-row items-start justify-between gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        <OpProductThumbnail
                          thumbnail={selectedQueueItem.order.productThumbnail}
                          layoutImage={selectedQueueItem.order.layoutPreviewImage || selectedQueueItem.order.layoutImage}
                          opNumber={selectedQueueItem.order.opNumber}
                          size="hero"
                          onClick={() => setSelectedLayoutOp(selectedQueueItem.order)}
                        />
                        <div>
                          <h3 className="text-2xl font-black text-[#1C1418]">OP #{selectedQueueItem.order.opNumber}</h3>
                          <p className="text-[#3A3034] font-semibold mt-1">{selectedQueueItem.order.productName}</p>
                          <p className="text-sm text-[#8A7D77] mt-1">
                            {selectedQueueItem.step.receivedQuantity.toLocaleString('pt-BR')}{' '}
                            {selectedQueueItem.step.unit} · Prazo{' '}
                            {new Date(selectedQueueItem.order.deadline).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <span
                        className={
                          'rounded-full px-3 py-1 text-xs font-black ' +
                          priorityStyle(selectedQueueItem.order.priority).badge
                        }
                      >
                        {priorityStyle(selectedQueueItem.order.priority).label}
                      </span>
                    </div>
                    <div className="mt-7 grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setSelectedQueueStepId(null)}
                        className="min-h-14 rounded-2xl border border-[#E5DAD3] bg-white font-black text-[#1C1418] hover:bg-[#F2EBE6] cursor-pointer"
                      >
                        VOLTAR
                      </button>
                      <button
                        onClick={() => startSelectedOp()}
                        className="min-h-14 rounded-2xl bg-emerald-600 font-black text-white hover:bg-emerald-500 flex items-center justify-center gap-2 cursor-pointer shadow-md"
                      >
                        <Play className="w-5 h-5" /> COMEÇAR PRODUÇÃO
                      </button>
                    </div>
                  </div>
                ) : machineQueue.length === 0 ? (
                  <div className="py-14 text-center">
                    <Inbox className="w-12 h-12 text-[#9A8B84] mx-auto" />
                    <p className="font-bold mt-4 text-[#1C1418]">Nenhuma OP na fila</p>
                    <p className="text-sm text-[#8A7D77] mt-1">Quando uma ordem for liberada, ela aparecerá aqui.</p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-6">
                    <div>
                      <h3 className="text-xs font-black tracking-widest text-emerald-700 uppercase">
                        Prontas para iniciar ({readyQueue.length})
                      </h3>
                      {readyQueue.length === 0 ? (
                        <p className="text-sm text-[#8A7D77] mt-2">Nenhuma OP pronta para esta máquina agora.</p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {readyQueue.map((item, index) => {
                            const style = priorityStyle(item.order.priority);
                            return (
                              <article
                                key={item.step.id}
                                className={'rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ' + style.card}
                              >
                                <div className="flex items-center gap-4 flex-1">
                                  <OpProductThumbnail
                                    thumbnail={item.order.productThumbnail}
                                    layoutImage={item.order.layoutPreviewImage || item.order.layoutImage}
                                    opNumber={item.order.opNumber}
                                    size="md"
                                    onClick={() => onSelectOp(item.order.id)}
                                  />
                                  <button onClick={() => onSelectOp(item.order.id)} className="text-left flex-1 cursor-pointer">
                                    <div className="flex items-center gap-2">
                                      <span className={'w-2.5 h-2.5 rounded-full ' + style.dot} />
                                      <span className="text-xs font-black">{style.label}</span>
                                      <span className="text-xs text-[#8A7D77]">#{index + 1} na fila</span>
                                    </div>
                                    <h3 className="text-lg font-black mt-1 text-[#1C1418]">OP #{item.order.opNumber}</h3>
                                    <p className="text-sm text-[#3A3034] font-medium">{item.order.productName}</p>
                                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                      <span className="text-xs text-[#8A7D77]">
                                        {item.step.receivedQuantity.toLocaleString('pt-BR')} {item.step.unit} · Prazo{' '}
                                        {new Date(item.order.deadline).toLocaleDateString('pt-BR')}
                                      </span>
                                      {(item.step.hasCord ||
                                        (item.step.processTypeId === 'proc_solda' && item.order.hasDrawstring)) && (
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300 font-extrabold">
                                          Cordão: SIM
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                </div>
                                <button
                                  onClick={() => setSelectedQueueStepId(item.step.id)}
                                  className="w-full sm:w-auto min-h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-3 text-sm font-black text-white flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                                >
                                  SELECIONAR <ChevronRight className="w-4 h-4" />
                                </button>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {upcomingQueue.length > 0 && (
                      <div>
                        <h3 className="text-xs font-black tracking-widest text-[#8A5A00] uppercase">
                          Em produção em etapas anteriores ({upcomingQueue.length})
                        </h3>
                        <p className="text-xs text-[#8A7D77] mt-1">Ainda não podem ser iniciadas aqui. Liberam quando a etapa anterior terminar.</p>
                        <div className="mt-3 space-y-3">
                          {upcomingQueue.map((item) => (
                            <article
                              key={item.step.id}
                              className="rounded-2xl border border-[#E5DAD3] bg-[#FAF5F1] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 opacity-90"
                            >
                              <button onClick={() => onSelectOp(item.order.id)} className="text-left flex-1 cursor-pointer">
                                <h3 className="text-base font-black text-[#1C1418]">OP #{item.order.opNumber}</h3>
                                <p className="text-sm text-[#3A3034]">{item.order.productName}</p>
                              </button>
                              <span className="rounded-xl bg-[#FFF4DB] border border-[#E8B54A] px-3 py-2 text-xs font-black text-[#5C3800] text-center">
                                {item.waitingOn}
                              </span>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )
          )}
        </div>
      )}

      <PauseModal
        isOpen={isPauseModalOpen}
        onClose={() => setIsPauseModalOpen(false)}
        onConfirm={(reason) => handlePauseOp(reason)}
        machineName={activeMachine.name}
        opNumber={currentOp?.opNumber || ''}
      />
      {currentStep && (
        <FinishStepModal
          isOpen={isFinishModalOpen}
          onClose={() => setIsFinishModalOpen(false)}
          onConfirm={(data) => handleFinishOp(data)}
          machineName={activeMachine.name}
          processName={currentStep.processName}
          opNumber={currentOp?.opNumber || ''}
          receivedQuantity={currentStep.receivedQuantity}
          unit={currentStep.unit}
        />
      )}

      {/* Full Layout Interactive Modal */}
      {selectedLayoutOp && (
        <FullLayoutModal order={selectedLayoutOp} onClose={() => setSelectedLayoutOp(null)} />
      )}
    </div>
  );
};

