import React, { useState } from 'react';
import { Plus, Trash2, Scale, X } from 'lucide-react';
import { PackingLine, ProductionOrder } from '../../types/mes';

interface PackingModalProps {
  order: ProductionOrder;
  /** Peças boas que saíram da embalagem, só para conferência. */
  expectedPieces: number;
  onClose: () => void;
  onConfirm: (linhas: PackingLine[]) => void;
}

type DraftLine = { caixas: string; pesoKg: string; pecasPorCaixa: string };

const toNumber = (value: string) => Number(String(value).replace(',', '.'));

/**
 * Pesagem da Expedição: o Carlos informa as caixas em linhas
 * (ex.: 10 caixas de 20 kg com 500 peças + 1 caixa de 15,9 kg com 380 peças).
 */
export const PackingModal: React.FC<PackingModalProps> = ({ order, expectedPieces, onClose, onConfirm }) => {
  const [lines, setLines] = useState<DraftLine[]>(
    order.packing?.linhas.map((l) => ({
      caixas: String(l.caixas),
      pesoKg: String(l.pesoKg).replace('.', ','),
      pecasPorCaixa: String(l.pecasPorCaixa),
    })) || [{ caixas: '', pesoKg: '', pecasPorCaixa: '' }]
  );
  const [error, setError] = useState<string | null>(null);

  const parsed = lines.map((l) => ({ caixas: toNumber(l.caixas), pesoKg: toNumber(l.pesoKg), pecasPorCaixa: toNumber(l.pecasPorCaixa) }));
  const valid = (l: PackingLine) => l.caixas > 0 && l.pesoKg > 0 && l.pecasPorCaixa > 0;
  const totalCaixas = parsed.filter(valid).reduce((t, l) => t + l.caixas, 0);
  const pesoTotal = parsed.filter(valid).reduce((t, l) => t + l.caixas * l.pesoKg, 0);
  const totalPecas = parsed.filter(valid).reduce((t, l) => t + l.caixas * l.pecasPorCaixa, 0);
  const piecesDiffer = totalPecas > 0 && expectedPieces > 0 && totalPecas !== expectedPieces;

  const update = (index: number, field: keyof DraftLine, value: string) => {
    setError(null);
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-[#E5DAD3] bg-[#FAF5F1] text-sm font-bold text-[#1C1418] focus:border-[#E30A78] focus:bg-white focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 bg-[#1C1418]/70 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white border border-[#E5DAD3] w-full max-w-xl rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-pink-50 border border-pink-200 text-[#E30A78]">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-lg text-[#1C1418]">Caixas e peso · OP #{order.opNumber}</h3>
              <p className="text-xs text-[#6E615B]">{order.client} · {order.productName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[#F2EBE6] cursor-pointer" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-[#6E615B]">
          Uma linha para cada grupo de caixas iguais. Ex.: 10 caixas de 20 kg com 500 peças, e mais 1 caixa de 15,9 kg com 380 peças.
        </p>

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[10px] font-black text-[#6E615B] uppercase">
            <span>Caixas</span>
            <span>Peso de cada (kg)</span>
            <span>Peças em cada</span>
            <span className="w-9" />
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
              <input inputMode="numeric" value={l.caixas} onChange={(e) => update(i, 'caixas', e.target.value)} placeholder="10" className={inputClass} aria-label={`Linha ${i + 1}: caixas`} />
              <input inputMode="decimal" value={l.pesoKg} onChange={(e) => update(i, 'pesoKg', e.target.value)} placeholder="20" className={inputClass} aria-label={`Linha ${i + 1}: peso de cada caixa em kg`} />
              <input inputMode="numeric" value={l.pecasPorCaixa} onChange={(e) => update(i, 'pecasPorCaixa', e.target.value)} placeholder="500" className={inputClass} aria-label={`Linha ${i + 1}: peças em cada caixa`} />
              <button
                type="button"
                onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev))}
                disabled={lines.length === 1}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#E5DAD3] text-[#8A7D77] hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                aria-label={`Remover linha ${i + 1}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, { caixas: '1', pesoKg: '', pecasPorCaixa: '' }])}
            className="mt-1 px-3 py-2 rounded-xl border border-dashed border-[#E30A78] text-[#E30A78] text-xs font-black flex items-center gap-1.5 cursor-pointer hover:bg-pink-50"
          >
            <Plus className="w-4 h-4" /> Adicionar caixa diferente (excedente)
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#FAF5F1] border border-[#E5DAD3] p-3 text-center">
          <div>
            <p className="text-[10px] font-black text-[#6E615B] uppercase">Caixas</p>
            <p className="text-xl font-black text-[#1C1418]">{totalCaixas.toLocaleString('pt-BR')}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-[#6E615B] uppercase">Peso total</p>
            <p className="text-xl font-black text-[#1C1418]">{pesoTotal.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-[#6E615B] uppercase">Peças</p>
            <p className="text-xl font-black text-[#1C1418]">{totalPecas.toLocaleString('pt-BR')}</p>
          </div>
        </div>

        {piecesDiffer && (
          <p className="text-xs font-bold rounded-xl bg-[#FFF4DB] border border-[#E8B54A] text-[#5C3800] p-3">
            Atenção: as caixas somam {totalPecas.toLocaleString('pt-BR')} peças, mas a embalagem registrou {expectedPieces.toLocaleString('pt-BR')} peças boas. Confira antes de enviar.
          </p>
        )}
        {error && <p className="text-xs font-bold text-rose-700">{error}</p>}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button onClick={onClose} className="min-h-12 rounded-2xl border border-[#E5DAD3] bg-white font-black text-[#1C1418] hover:bg-[#F2EBE6] cursor-pointer">
            CANCELAR
          </button>
          <button
            onClick={() => {
              try {
                onConfirm(parsed);
              } catch (err: any) {
                setError(err?.message || 'Não foi possível salvar as caixas.');
              }
            }}
            className="min-h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-black text-white cursor-pointer"
          >
            ENVIAR PARA O EMBARQUE
          </button>
        </div>
      </div>
    </div>
  );
};
