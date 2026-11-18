import React from 'react';
import { useMesStore } from '../../hooks/useMesStore';
import { Package, Layers, ArrowRight, CheckCircle2, Sliders } from 'lucide-react';

export const ProductsView: React.FC = () => {
  const { products, processTypes, routingRules } = useMesStore();

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-line p-5 rounded-2xl">
        <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
          <Package className="w-5 h-5 text-amber-700" />
          <span>Catálogo de Produtos & Motor de Roteamento Dinâmico</span>
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Templates padrão da Bella Top e regras de injeção automática de etapas conforme especificações da OP.
        </p>
      </div>

      {/* Product Templates */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-ink flex items-center gap-2">
          <Package className="w-4 h-4 text-amber-700" />
          <span>Modelos e Roteiros Padrão da Fábrica</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {products.map((p) => (
            <div
              key={p.id}
              className="bg-white border border-line rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-hover text-amber-700 font-bold border border-line">
                      {p.code}
                    </span>
                    <h4 className="font-bold text-base text-ink">{p.name}</h4>
                  </div>
                  <p className="text-xs text-muted mt-1">
                    Material: {p.material} • Gramaturas: {p.allowedGrammages.join(', ')}g
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {p.family}
                </span>
              </div>

              {/* Standard Route Steps */}
              <div className="space-y-2 pt-2 border-t border-line">
                <span className="text-[11px] uppercase tracking-wider text-subtle font-semibold block">
                  Roteiro Sequencial de Produção:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.defaultProcessSequence.map((procId, idx) => {
                    const proc = processTypes.find((pt) => pt.id === procId);
                    return (
                      <React.Fragment key={procId}>
                        <span className="px-2.5 py-1 rounded-lg bg-canvas border border-line text-xs font-semibold text-ink flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-brand/10 text-brand-dark text-[10px] font-mono flex items-center justify-center">
                            {idx + 1}
                          </span>
                          {proc?.name || procId}
                        </span>
                        {idx < p.defaultProcessSequence.length - 1 && (
                          <ArrowRight className="w-3 h-3 text-faint" />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic Conditional Rules (Section 15) */}
      <div className="bg-white border border-line rounded-2xl p-5 space-y-4">
        <h3 className="text-base font-bold text-ink flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-700" />
          <span>Regras do Motor de Roteamento Inteligente (Chão de Fábrica)</span>
        </h3>
        <p className="text-xs text-muted">
          Quando a IA faz a leitura da OP, estas regras condicionais injetam ou removem estações de trabalho automaticamente.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {routingRules.map((rule) => {
            const injectedProc = processTypes.find((p) => p.id === rule.targetProcessTypeId);
            return (
              <div
                key={rule.id}
                className="p-3.5 rounded-xl bg-canvas border border-line text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink">{rule.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand-dark">
                    Regra Automática
                  </span>
                </div>
                <div className="text-muted text-[11px] font-mono">
                  Gatilho: {rule.conditionType} === {String(rule.conditionValue)}
                </div>
                <div className="text-emerald-700 font-semibold text-xs flex items-center gap-1">
                  <span>↳ Ação: {rule.action} →</span>
                  <span>{injectedProc?.name || rule.targetProcessTypeId}</span>
                  <span className="text-subtle font-mono">({rule.insertPosition})</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
