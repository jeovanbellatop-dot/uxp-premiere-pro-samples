import React from 'react';
import { ShieldAlert, ArrowLeft, Lock, UserCheck } from 'lucide-react';
import { useMesStore } from '../../hooks/useMesStore';
import { SystemSectorCode } from '../../types/mes';

interface AccessDeniedViewProps {
  requestedArea?: string;
  onReturnToAllowed: () => void;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  requestedArea = 'Esta funcionalidade',
  onReturnToAllowed,
}) => {
  const { authenticatedUser, selectedSector } = useMesStore();

  const userSectors = authenticatedUser?.sectors || [];
  const activeSector = selectedSector || userSectors[0] || 'Área não definida';

  return (
    <div
      id="access_denied_screen"
      className="max-w-2xl mx-auto my-12 p-8 bg-white border border-rose-200 rounded-2xl shadow-sm text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center mx-auto mb-6">
        <ShieldAlert className="w-9 h-9" />
      </div>

      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100/60 text-rose-800 text-xs font-bold tracking-wider uppercase mb-3">
        <Lock className="w-3.5 h-3.5" />
        Bloqueio de Segurança Real
      </div>

      <h2 className="text-2xl font-bold text-ink mb-2 tracking-tight">
        ACESSO NEGADO
      </h2>

      <p className="text-sm text-muted max-w-md mx-auto mb-6 leading-relaxed">
        Você não possui permissão para acessar <strong className="text-ink">{requestedArea}</strong>. Cada operador possui acesso restrito exclusivamente às funções e máquinas atribuídas pelo Administrador.
      </p>

      {authenticatedUser && (
        <div className="bg-canvas border border-line rounded-2xl p-4 mb-6 text-left max-w-md mx-auto text-xs space-y-2">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <span className="text-subtle font-medium">Usuário Conectado:</span>
            <span className="font-bold text-ink">{authenticatedUser.name} (@{authenticatedUser.login})</span>
          </div>
          <div className="flex items-center justify-between border-b border-line pb-2">
            <span className="text-subtle font-medium">Funções Autorizadas:</span>
            <span className="font-semibold text-emerald-800">
              {userSectors.length > 0 ? userSectors.join(', ') : 'Nenhuma'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-subtle font-medium">Área Ativa Atual:</span>
            <span className="font-semibold text-amber-800">{activeSector}</span>
          </div>
        </div>
      )}

      <div className="flex justify-center gap-3">
        <button
          id="btn_return_authorized_area"
          onClick={onReturnToAllowed}
          className="px-6 py-2.5 bg-brand hover:bg-brand-dark text-white text-xs font-bold rounded-xl transition-all shadow-sm shadow-brand/20 flex items-center gap-2 cursor-pointer uppercase tracking-wider"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Minha Área Autorizada
        </button>
      </div>
    </div>
  );
};
