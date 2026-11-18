"""
Segunda passada do tema (rodar uma vez, a partir da pasta bella-top): python3 scripts/codemodAccents.py
- Onde o tema antigo usava "âmbar" como cor da marca (ações principais, item ativo, links,
  ícones de título), passa para o rosa da marca. Pausa, alerta e manutenção ficam em âmbar.
- Texto claro sobre fundo claro (ex.: text-amber-200 em aviso âmbar) vira texto escuro legível.
"""
import re
import pathlib

SRC = pathlib.Path(__file__).resolve().parent.parent / 'src'

# (arquivo, trecho antigo, trecho novo, quantas vezes no máximo; 0 = todas)
TARGETED = [
    ('components/dashboard/FactoryOverview.tsx', 'bg-amber-500 hover:bg-amber-700 text-white', 'bg-brand hover:bg-brand-dark text-white', 0),
    ('components/dashboard/FactoryOverview.tsx', 'text-amber-500 hover:text-amber-700', 'text-brand hover:text-brand-dark', 0),
    ('components/routing/ProductionRouteView.tsx', 'bg-amber-500 hover:bg-amber-700 text-white', 'bg-brand hover:bg-brand-dark text-white', 0),
    ('components/routing/ProductionRouteView.tsx', 'text-amber-500', 'text-brand', 0),
    ('components/routing/ProductionRouteView.tsx', "'bg-amber-500 text-white'", "'bg-brand text-white'", 0),
    ('components/routing/ProductionRouteFlow.tsx', 'text-amber-500', 'text-brand', 0),
    ('components/routing/ProductionRouteFlow.tsx', "'bg-amber-500 text-white shadow-sm'", "'bg-brand text-white shadow-sm'", 0),
    ('components/routing/ProductionRouteFlow.tsx', "'bg-amber-500 text-white'", "'bg-brand text-white'", 0),
    ('components/pcp/FullLayoutModal.tsx', 'text-amber-500', 'text-brand', 0),
    ('components/admin/StorageAdminPanel.tsx', 'bg-amber-700 hover:bg-amber-500', 'bg-brand hover:bg-brand-dark', 0),
    ('components/admin/UserManagementView.tsx', 'bg-amber-700 hover:bg-amber-500', 'bg-brand hover:bg-brand-dark', 0),
    ('components/admin/UserManagementView.tsx', 'shadow-amber-700/20', 'shadow-brand/20', 0),
    ('components/admin/UserManagementView.tsx', 'hover:text-amber-500', 'hover:text-brand', 0),
    ('components/admin/UserManagementView.tsx', "'bg-amber-500/20 border-amber-500/60 text-amber-700'", "'bg-brand/10 border-brand/50 text-brand-dark'", 0),
    ('components/catalogs/ProductsView.tsx', 'bg-amber-500/20 text-amber-700', 'bg-brand/10 text-brand-dark', 0),
    ('App.tsx', 'bg-amber-500 text-white font-bold shadow-sm shadow-amber-50/30', 'bg-brand text-white font-semibold shadow-sm', 0),
    ('App.tsx', 'rounded bg-amber-500 text-white', 'rounded bg-brand text-white', 0),
    ('App.tsx', 'bg-amber-500/20 text-amber-700', 'bg-brand/15 text-brand', 0),
]

for rel, old, new, _ in TARGETED:
    f = SRC / rel
    s = f.read_text(encoding='utf-8')
    if old not in s:
        print(f'aviso: não achei em {rel}: {old}')
        continue
    f.write_text(s.replace(old, new), encoding='utf-8')

# Foco de campo de texto: sempre com a cor da marca.
focus_re = re.compile(r'\bfocus:(border|ring)-amber-(500|700)\b')
# Texto claro em fundo claro -> texto escuro legível (a barra lateral escura fica de fora).
light_text_re = re.compile(r'(?<![:\w-])text-(amber|rose|emerald|red|blue|purple|indigo|sky|cyan)-(100|200)\b')

for f in SRC.rglob('*.tsx'):
    s = f.read_text(encoding='utf-8')
    out = focus_re.sub(lambda m: f'focus:{m.group(1)}-brand', s)
    if f.name != 'App.tsx':
        out = light_text_re.sub(lambda m: f'text-{m.group(1)}-800', out)
    if out != s:
        f.write_text(out, encoding='utf-8')
print('ok')
