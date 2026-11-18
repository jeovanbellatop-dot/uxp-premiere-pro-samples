import React, { useState } from 'react';
import { useMesStore } from '../../hooks/useMesStore';
import { getUserMachineSummary } from '../../utils/userMachines';
import { History, Search, ShieldCheck, Clock, User, Filter } from 'lucide-react';

/**
 * Registros antigos e integrações podem trazer action/detalhes como objetos.
 * A auditoria nunca deve deixar de renderizar por causa de um dado legado.
 */
const auditValueToText = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return [record.label, record.type, record.name, record.action]
      .filter((item): item is string | number | boolean =>
        typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
      )
      .map(String)
      .join(' ');
  }
  return String(value);
};

export const AuditLogsView: React.FC = () => {
  const { auditLogs, users, machines } = useMesStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [entityFilter, setEntityFilter] = useState('ALL');

  const filteredLogs = auditLogs.filter((log) => {
    const needle = searchTerm.toLocaleLowerCase('pt-BR');
    const matchesSearch = [
      auditValueToText(log.action),
      auditValueToText(log.details),
      auditValueToText(log.userName),
      auditValueToText(log.entityId),
    ].some((value) => value.toLocaleLowerCase('pt-BR').includes(needle));

    const matchesEntity = entityFilter === 'ALL' || log.entityType === entityFilter;

    return matchesSearch && matchesEntity;
  });

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-line p-5 rounded-2xl">
        <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
          <History className="w-5 h-5 text-amber-700" />
          <span>Rastreabilidade & Trilha de Auditoria (Audit Trail)</span>
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Registro imutável de todas as ações de chão de fábrica, apontamentos de operadores, pausas e alterações de roteiro pelo PCP.
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-line p-4 rounded-xl text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por Ação, Operador, Detalhes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-canvas border border-line text-ink rounded-lg pl-9 pr-3 py-2 text-xs placeholder-faint focus:outline-none focus:border-brand"
          />
        </div>

        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="bg-canvas border border-line text-ink rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-brand"
        >
          <option value="ALL">Todas as Entidades</option>
          <option value="OP">Ordens de Produção (OP)</option>
          <option value="OPERATION">Operações & Apontamentos</option>
          <option value="MACHINE">Máquinas & Equipamentos</option>
          <option value="ROUTING">Roteiros Dinâmicos</option>
          <option value="CONFIG">Configurações do Sistema</option>
        </select>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-canvas text-muted uppercase text-[10px] tracking-wider border-b border-line font-semibold">
              <tr>
                <th className="py-3 px-4">Data / Hora</th>
                <th className="py-3 px-4">Usuário</th>
                <th className="py-3 px-4">Ação Realizada</th>
                <th className="py-3 px-4">Entidade</th>
                <th className="py-3 px-4">Detalhes Técnicos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-medium text-ink-soft">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-hover transition-colors">
                  <td className="py-3 px-4 font-mono text-[11px] text-muted whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString('pt-BR')}
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-bold text-ink text-xs">{log.userName}</div>
                    <div className="text-[10px] text-amber-700/80 font-mono">{log.userRole}</div>
                    {(() => {
                      const userObj = users.find((u) => u.name === log.userName || u.id === log.userId);
                      if (!userObj) return null;
                      return (
                        <div className="text-[9px] text-muted mt-0.5">
                          ⚙️ {getUserMachineSummary(userObj, machines)}
                        </div>
                      );
                    })()}
                  </td>

                  <td className="py-3 px-4 font-semibold text-ink">
                    {auditValueToText(log.action) || 'AÇÃO NÃO INFORMADA'}
                  </td>

                  <td className="py-3 px-4">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-hover text-ink-soft border border-line">
                      {log.entityType}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-ink-soft text-xs">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
