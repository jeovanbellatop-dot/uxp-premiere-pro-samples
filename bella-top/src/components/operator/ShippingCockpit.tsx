import React, { useState } from 'react';
import { FileText, Truck, PackageCheck, CheckCircle2, History, Scale, Search } from 'lucide-react';
import { useMesStore } from '../../hooks/useMesStore';
import { ProductionOrder, ShippingStage } from '../../types/mes';
import { OpProductThumbnail } from '../common/OpProductThumbnail';

interface ShippingCockpitProps {
  onSelectOp?: (opId: string) => void;
}

type Tab = Exclude<ShippingStage, 'CONCLUIDO'> | 'HISTORICO';

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'EMITIR_NF', label: 'Emitir nota fiscal', icon: FileText },
  { id: 'EMBARQUE', label: 'Embarque', icon: Truck },
  { id: 'POS_EMBARQUE', label: 'Pós-embarque', icon: PackageCheck },
  { id: 'HISTORICO', label: 'Histórico', icon: History },
];

/** Datetime-local do navegador (hora local) a partir de agora. */
const nowLocalInput = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR') : '-');

/**
 * Embarque (Ramon): recebe da Expedição as caixas e pesos de cada OP, registra a
 * nota fiscal, o embarque e conclui o pedido, que então fica só no histórico.
 */
export const ShippingCockpit: React.FC<ShippingCockpitProps> = ({ onSelectOp }) => {
  const { orders, registerInvoice, registerShipment, concludeShipping } = useMesStore();
  const [tab, setTab] = useState<Tab>('EMITIR_NF');
  const [search, setSearch] = useState('');
  const [nfInput, setNfInput] = useState<Record<string, string>>({});
  const [shipInput, setShipInput] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const shippingOrders = orders.filter((o) => o.packing && o.shipping);
  const inTab = (o: ProductionOrder, t: Tab) => (t === 'HISTORICO' ? o.shipping?.etapa === 'CONCLUIDO' : o.shipping?.etapa === t);
  const count = (t: Tab) => shippingOrders.filter((o) => inTab(o, t)).length;

  const q = search.trim().toLowerCase();
  const list = shippingOrders
    .filter((o) => inTab(o, tab))
    .filter(
      (o) =>
        !q ||
        o.opNumber.toLowerCase().includes(q) ||
        (o.client || '').toLowerCase().includes(q) ||
        (o.shipping?.notaFiscal || '').toLowerCase().includes(q)
    )
    .sort((a, b) =>
      tab === 'HISTORICO'
        ? String(b.shipping?.concluidoEm || '').localeCompare(String(a.shipping?.concluidoEm || ''))
        : String(a.packing?.registradoEm || '').localeCompare(String(b.packing?.registradoEm || ''))
    );

  const run = (fn: () => void, ok: string) => {
    try {
      fn();
      setMessage({ ok: true, text: ok });
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || 'Não foi possível concluir a ação.' });
    }
    setTimeout(() => setMessage(null), 5000);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-white p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-pink-50 border border-pink-200 text-brand">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink">Embarque</h2>
            <p className="text-xs text-muted">Nota fiscal, transportadora e embarque dos pedidos que saíram da Expedição.</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={
                'rounded-2xl border px-3 py-3 text-left cursor-pointer transition-colors ' +
                (tab === id ? 'border-brand bg-pink-50 text-brand-dark' : 'border-line bg-canvas text-ink-soft hover:bg-white')
              }
            >
              <Icon className="w-4 h-4" />
              <span className="block text-xs font-bold mt-1">{label}</span>
              <span className="block text-2xl font-bold leading-none mt-1">{count(id)}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por OP, cliente ou nota fiscal"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-line bg-canvas text-sm focus:border-brand focus:bg-white focus:outline-none"
          />
        </div>
      </section>

      {message && (
        <div
          className={
            'p-4 rounded-2xl border text-sm font-bold ' +
            (message.ok ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900')
          }
        >
          {message.text}
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-12 text-center">
          <PackageCheck className="w-12 h-12 text-faint mx-auto opacity-60" />
          <p className="font-bold mt-3 text-ink">Nenhum pedido nesta etapa</p>
          <p className="text-sm text-subtle mt-1">
            {tab === 'EMITIR_NF' ? 'Quando o Carlos registrar as caixas de uma OP, ela aparece aqui.' : 'Nada por aqui agora.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((order) => {
            const packing = order.packing!;
            const shipping = order.shipping!;
            return (
              <article key={order.id} className="rounded-2xl border border-line bg-white p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button onClick={() => onSelectOp?.(order.id)} className="flex items-center gap-3 text-left cursor-pointer">
                    <OpProductThumbnail
                      thumbnail={order.productThumbnail}
                      layoutImage={order.layoutPreviewImage || order.layoutImage}
                      opNumber={order.opNumber}
                      size="md"
                      interactive={false}
                    />
                    <div>
                      <h3 className="text-lg font-bold text-ink">OP #{order.opNumber}</h3>
                      <p className="text-sm text-ink-soft font-semibold">{order.client}</p>
                      <p className="text-xs text-subtle">
                        {order.productName} · Pedido {order.orderNumber}
                      </p>
                    </div>
                  </button>
                  <div className="text-right text-xs text-muted">
                    {shipping.notaFiscal && (
                      <p>
                        NF <strong className="text-ink">{shipping.notaFiscal}</strong>
                      </p>
                    )}
                    {shipping.embarcadoEm && <p>Embarcado em {fmtDate(shipping.embarcadoEm)}</p>}
                    {shipping.concluidoEm && <p>Concluído em {fmtDate(shipping.concluidoEm)}</p>}
                  </div>
                </div>

                {/* Detalhes das caixas que vieram da Expedição */}
                <div className="rounded-2xl bg-canvas border border-line p-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-muted uppercase">
                    <Scale className="w-4 h-4" /> Caixas (pesagem de {packing.registradoPor}, {fmtDate(packing.registradoEm)})
                  </div>
                  <table className="w-full mt-2 text-sm">
                    <thead>
                      <tr className="text-left text-[11px] text-subtle">
                        <th className="font-bold py-1">Caixas</th>
                        <th className="font-bold py-1">Peso de cada</th>
                        <th className="font-bold py-1">Peças em cada</th>
                        <th className="font-bold py-1 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packing.linhas.map((l, i) => (
                        <tr key={i} className="border-t border-line text-ink">
                          <td className="py-1.5 font-bold">{l.caixas}</td>
                          <td className="py-1.5">{l.pesoKg.toLocaleString('pt-BR')} kg</td>
                          <td className="py-1.5">{l.pecasPorCaixa.toLocaleString('pt-BR')}</td>
                          <td className="py-1.5 text-right">
                            {(l.caixas * l.pesoKg).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg ·{' '}
                            {(l.caixas * l.pecasPorCaixa).toLocaleString('pt-BR')} pç
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-ink font-bold text-ink">
                        <td className="py-1.5">{packing.totalCaixas}</td>
                        <td className="py-1.5" colSpan={2}>Total</td>
                        <td className="py-1.5 text-right">
                          {packing.pesoTotalKg.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg ·{' '}
                          {packing.totalPecas.toLocaleString('pt-BR')} pç
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {shipping.etapa === 'EMITIR_NF' && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={nfInput[order.id] || ''}
                      onChange={(e) => setNfInput({ ...nfInput, [order.id]: e.target.value })}
                      placeholder="Número da nota fiscal"
                      aria-label={`Número da nota fiscal da OP ${order.opNumber}`}
                      className="flex-1 px-3 py-3 rounded-xl border border-line bg-canvas text-sm font-bold focus:border-brand focus:bg-white focus:outline-none"
                    />
                    <button
                      onClick={() => run(() => registerInvoice(order.id, nfInput[order.id] || ''), `Nota fiscal registrada na OP ${order.opNumber}. Ela passou para "Embarque".`)}
                      className="min-h-12 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <FileText className="w-4 h-4" /> REGISTRAR NOTA FISCAL
                    </button>
                  </div>
                )}

                {shipping.etapa === 'EMBARQUE' && (
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <label className="flex-1 text-xs font-bold text-muted">
                      Data e hora em que a carga saiu
                      <input
                        type="datetime-local"
                        value={shipInput[order.id] || nowLocalInput()}
                        onChange={(e) => setShipInput({ ...shipInput, [order.id]: e.target.value })}
                        className="mt-1 w-full px-3 py-3 rounded-xl border border-line bg-canvas text-sm font-bold text-ink focus:border-brand focus:bg-white focus:outline-none"
                      />
                    </label>
                    <button
                      onClick={() =>
                        run(
                          () => registerShipment(order.id, shipInput[order.id] || nowLocalInput()),
                          `Embarque da OP ${order.opNumber} registrado. Ela passou para "Pós-embarque".`
                        )
                      }
                      className="min-h-12 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer sm:self-end"
                    >
                      <Truck className="w-4 h-4" /> CONFIRMAR EMBARQUE
                    </button>
                  </div>
                )}

                {shipping.etapa === 'POS_EMBARQUE' && (
                  <button
                    onClick={() => {
                      if (!window.confirm(`Concluir e encerrar a OP ${order.opNumber}? Ela sai das pendências e fica só no histórico.`)) return;
                      run(() => concludeShipping(order.id), `OP ${order.opNumber} concluída e encerrada. Ela está no Histórico.`);
                    }}
                    className="w-full min-h-12 rounded-xl bg-ink hover:bg-ink-soft text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" /> CONCLUIR E ENCERRAR
                  </button>
                )}

                {shipping.etapa === 'CONCLUIDO' && (
                  <p className="text-xs text-muted">
                    NF por {shipping.nfRegistradaPor} · Embarque por {shipping.embarqueRegistradoPor} · Encerrado por {shipping.concluidoPor}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
