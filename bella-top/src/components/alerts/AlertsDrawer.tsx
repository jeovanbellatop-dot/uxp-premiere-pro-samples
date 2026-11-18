import React from 'react';
import { useMesStore } from '../../hooks/useMesStore';
import {
  X,
  Bell,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  CheckCheck
} from 'lucide-react';

interface AlertsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectOp: (opId: string) => void;
  onSelectMachine: (machineId: string) => void;
}

export const AlertsDrawer: React.FC<AlertsDrawerProps> = ({
  isOpen,
  onClose,
  onSelectOp,
  onSelectMachine,
}) => {
  const { alerts, markAlertRead, markAllAlertsRead } = useMesStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-canvas backdrop-blur-sm animate-in fade-in">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-line shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-5 bg-canvas border-b border-line flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-600/20 text-rose-700 flex items-center justify-center font-bold">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-ink">
                  Alertas Operacionais de Fábrica
                </h3>
                <p className="text-[11px] text-muted">
                  Notificações de perdas, paradas de linha e riscos de prazo
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-muted hover:text-ink hover:bg-hover"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mark all as read bar */}
          <div className="px-5 py-2.5 bg-canvas border-b border-line flex items-center justify-between text-xs">
            <span className="text-muted">
              {alerts.filter((a) => !a.isRead).length} não lidos
            </span>
            <button
              onClick={markAllAlertsRead}
              className="text-amber-700 hover:underline flex items-center gap-1 font-semibold text-[11px]"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Marcar todos como lidos</span>
            </button>
          </div>

          {/* List of Alerts */}
          <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
            {alerts.length > 0 ? (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  onClick={() => {
                    markAlertRead(alert.id);
                    if (alert.targetOpId) onSelectOp(alert.targetOpId);
                    else if (alert.targetMachineId) onSelectMachine(alert.targetMachineId);
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    !alert.isRead
                      ? 'bg-canvas border-amber-500/40 ring-1 ring-amber-500/20'
                      : 'bg-white border-line opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {alert.type === 'TIME_OVERDUE' || alert.type === 'HIGH_LOSS' ? (
                        <AlertOctagon className="w-4 h-4 text-rose-700 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                      )}
                      <span className="font-bold text-ink text-xs">{alert.title}</span>
                    </div>

                    <span className="text-[10px] text-subtle font-mono whitespace-nowrap">
                      {new Date(alert.timestamp).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <p className="text-ink-soft text-[11px] mt-1.5">{alert.message}</p>

                  <div className="mt-2.5 pt-2 border-t border-line flex items-center justify-between text-[10px] text-muted">
                    <span className="font-mono">{alert.type}</span>
                    <span className="text-amber-700 hover:underline font-semibold">
                      Ver no Chão de Fábrica →
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-subtle">Nenhum alerta registrado.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
