import React from 'react';
import { useMesStore } from '../../hooks/useMesStore';
import {
  BarChart3,
  TrendingUp,
  Flame,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Cpu
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

export const ReportsView: React.FC = () => {
  const { machines, orders, processTypes } = useMesStore();

  // Aggregate losses per process
  const processLossData: { [key: string]: { name: string; loss: number; produced: number } } = {};

  processTypes.forEach((pt) => {
    processLossData[pt.id] = { name: pt.name, loss: 0, produced: 0 };
  });

  orders.forEach((o) => {
    o.steps.forEach((s) => {
      if (processLossData[s.processTypeId]) {
        processLossData[s.processTypeId].loss += s.lossQuantity || 0;
        processLossData[s.processTypeId].produced += s.producedQuantity || 0;
      }
    });
  });

  // Só as estações que já tiveram produção; nomes longos ficam legíveis no gráfico deitado.
  const chartData = Object.values(processLossData).filter((row: any) => (row.produced || 0) + (row.loss || 0) > 0);

  // Machine OEE data
  const oeeData = machines.map((m) => ({
    name: m.code,
    oee: Math.round(m.historicalEfficiencyFactor * 100),
    status: m.status,
  }));

  const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#06b6d4', '#ec4899'];

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-line p-5 rounded-2xl">
        <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-brand" />
          <span>Relatórios Gerenciais, OEE & Análise de Perdas</span>
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Indicadores de desempenho de chão de fábrica, taxa de refugo por estação e cumprimento de prazos.
        </p>
      </div>

      {/* 2 Charts Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chart 1: Perdas vs Produção por Estação */}
        <div className="bg-white border border-line rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-ink flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-rose-700" />
              <span>Volume de Produção e Perdas por Estação</span>
            </h3>
            <span className="text-[11px] text-muted">Total Unidades</span>
          </div>

          <div className="h-64 w-full pt-2">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-subtle border border-dashed border-line rounded-xl">
                Nenhuma produção apontada ainda.
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" stroke="#94A3B8" tickLine={false} axisLine={false} style={{ fontSize: '11px' }} />
                <YAxis type="category" dataKey="name" width={130} interval={0} stroke="#475569" tickLine={false} axisLine={false} style={{ fontSize: '11px' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: '8px', fontSize: '12px', color: '#0F172A' }}
                  cursor={{ fill: '#F1F5F9' }}
                />
                <Bar dataKey="produced" name="Produzido (Bom)" fill="#059669" radius={[0, 4, 4, 0]} barSize={14} />
                <Bar dataKey="loss" name="Perdas (Refugo)" fill="#E11D48" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Eficiência OEE por Máquina */}
        <div className="bg-white border border-line rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-ink flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-amber-700" />
              <span>Eficiência Operacional OEE por Máquina (%)</span>
            </h3>
            <span className="text-[11px] text-muted">Meta: &gt; 85%</span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={oeeData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" stroke="#94A3B8" tickLine={false} axisLine={false} interval={0} style={{ fontSize: '10px' }} />
                <YAxis domain={[0, 100]} stroke="#94A3B8" tickLine={false} axisLine={false} style={{ fontSize: '11px' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: '8px', fontSize: '12px', color: '#0F172A' }}
                  cursor={{ fill: '#F1F5F9' }}
                />
                <Bar dataKey="oee" name="OEE (%)" fill="#E30A78" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
