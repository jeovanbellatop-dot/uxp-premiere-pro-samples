import React from 'react';
import {
  Layers,
  Scissors,
  Printer,
  Sparkles,
  Zap,
  Package,
  Boxes,
  ShieldCheck,
  Check,
  LogOut
} from 'lucide-react';
import { useMesStore } from '../../hooks/useMesStore';
import { SystemSectorCode } from '../../types/mes';
import { SECTOR_DEFINITIONS } from '../../data/initialData';

interface SectorSelectorModalProps {
  onSectorSelected: (sector: SystemSectorCode) => void;
  isOpen: boolean;
  canClose?: boolean;
  onClose?: () => void;
}

export const SectorSelectorModal: React.FC<SectorSelectorModalProps> = ({
  onSectorSelected,
  isOpen,
  canClose = false,
  onClose,
}) => {
  const { authenticatedUser, selectedSector, logout } = useMesStore();

  if (!isOpen || !authenticatedUser) return null;

  const userSectors = authenticatedUser.sectors || [];
  const isAdmin = userSectors.includes('ADMIN');

  // Se for admin, pode escolher qualquer setor da fábrica ou o Painel Geral Admin
  const availableSectors = isAdmin
    ? SECTOR_DEFINITIONS
    : SECTOR_DEFINITIONS.filter((s) => userSectors.includes(s.code));

  const getSectorIcon = (code: SystemSectorCode) => {
    switch (code) {
      case 'ADMIN':
        return <ShieldCheck className="w-5 h-5 text-brand" />;
      case 'PCP':
        return <Layers className="w-5 h-5 text-brand" />;
      case 'REFILE':
        return <Scissors className="w-5 h-5 text-brand" />;
      case 'FLEXOGRAFIA':
        return <Printer className="w-5 h-5 text-brand" />;
      case 'ESTAMPARIA':
        return <Sparkles className="w-5 h-5 text-brand" />;
      case 'CORTE_SOLDA':
        return <Zap className="w-5 h-5 text-brand" />;
      case 'ALCA':
        return <Boxes className="w-5 h-5 text-brand" />;
      case 'EXPEDICAO':
        return <Package className="w-5 h-5 text-brand" />;
      default:
        return <Layers className="w-5 h-5 text-muted" />;
    }
  };

  return (
    <div
      id="sector_selector_overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="sector_selector_modal"
        className="w-full max-w-xl bg-white border border-line rounded-2xl shadow-2xl p-6 sm:p-8"
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between pb-4 border-b border-line mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-brand-tint text-brand border border-brand-soft rounded-full text-xs font-bold">
                Olá, {authenticatedUser.name}
              </span>
              <span className="text-xs text-subtle">(@{authenticatedUser.login})</span>
            </div>
            <h2 className="text-xl font-bold text-ink mt-1.5">Selecione o Posto de Trabalho</h2>
            <p className="text-xs text-muted mt-0.5">
              Escolha a função operacional que você irá operar nesta sessão
            </p>
          </div>

          <button
            onClick={() => logout()}
            className="px-3 py-1.5 bg-canvas hover:bg-hover text-muted hover:text-ink text-xs font-semibold rounded-xl border border-line transition-all flex items-center gap-1.5 cursor-pointer"
            title="Encerrar Sessão"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>

        {/* Grade de Setores Autorizados */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {availableSectors.map((sector) => {
            const isCurrent = selectedSector === sector.code;
            return (
              <button
                key={sector.code}
                id={`btn_sector_select_${sector.code.toLowerCase()}`}
                onClick={() => onSectorSelected(sector.code)}
                className={`p-4 rounded-2xl border text-left transition-all duration-150 relative flex flex-col justify-between group cursor-pointer ${
                  isCurrent
                    ? 'bg-brand-tint border-2 border-brand text-ink shadow-sm shadow-brand/10'
                    : 'bg-canvas border-line hover:border-brand-soft hover:bg-brand-tint text-ink'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 bg-white rounded-xl border border-line">
                      {getSectorIcon(sector.code)}
                    </div>
                    {isCurrent && (
                      <span className="px-2 py-0.5 bg-brand text-white text-[10px] font-bold rounded-full flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        ATIVO
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-sm text-ink group-hover:text-brand transition-colors">
                    {sector.name}
                  </h3>
                  <p className="text-xs text-muted mt-1 line-clamp-2">
                    {sector.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {canClose && onClose && (
          <div className="mt-6 pt-4 border-t border-line flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-canvas hover:bg-hover text-ink text-xs font-bold rounded-xl border border-line transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
