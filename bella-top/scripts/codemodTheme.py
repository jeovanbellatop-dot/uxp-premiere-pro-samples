"""
Conversão única do visual para o tema profissional (rodar uma vez, a partir da pasta bella-top):
  python3 scripts/codemodTheme.py

1. Classes de cor que o tema antigo "invertia" (ex.: amber virava rosa, emerald-900 virava verde claro)
   passam para a tonalidade padrão do Tailwind que mostra o mesmo tom.
2. Cores escritas à mão (ex.: text-[#1C1418]) passam para os tokens do tema (ex.: text-ink).
3. Cantos e pesos de fonte mais sóbrios.
"""
import re
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = [p for p in (ROOT / 'src').rglob('*.tsx')] + [ROOT / 'index.html']

PREFIX = r'((?:[a-z0-9-]+:)*-?(?:bg|text|border|ring|ring-offset|from|to|via|shadow|fill|stroke|divide|outline|placeholder|accent|caret|decoration)(?:-[trblxy])?)'

# Tonalidade antiga (com o remapeamento do tema antigo) -> tonalidade padrão equivalente.
WARN = {'50': '50', '100': '100', '200': '200', '300': '700', '400': '700', '500': '500', '600': '700', '700': '800', '800': '200', '900': '200', '950': '50'}
SHADE_MAP = {
    'orange': ('amber', WARN),
    'amber': ('amber', WARN),
    'emerald': ('emerald', {'300': '700', '400': '700', '500': '600', '600': '700', '700': '800', '800': '200', '900': '100', '950': '50'}),
    'rose': ('rose', {'300': '700', '400': '700', '500': '600', '600': '700', '700': '800', '800': '200', '900': '100', '950': '50'}),
    'red': ('red', {'300': '700', '400': '700', '500': '600', '900': '100', '950': '50'}),
    'yellow': ('amber', {'300': '800', '400': '800', '500': '600', '900': '100', '950': '50'}),
    'blue': ('blue', {'300': '700', '400': '700', '500': '600', '900': '100', '950': '50'}),
    'sky': ('sky', {'300': '700', '400': '700', '950': '50'}),
    'cyan': ('cyan', {'300': '700', '400': '700', '950': '50'}),
    'indigo': ('indigo', {'300': '800', '400': '800', '950': '50'}),
    'purple': ('purple', {'300': '800', '400': '800', '950': '50'}),
}
palette_re = re.compile(PREFIX + r'-(' + '|'.join(SHADE_MAP) + r')-(50|100|200|300|400|500|600|700|800|900|950)\b')


def fix_palette(m: re.Match) -> str:
    prefix, family, shade = m.group(1), m.group(2), m.group(3)
    new_family, table = SHADE_MAP[family]
    return f'{prefix}-{new_family}-{table.get(shade, shade)}'


# Cor escrita à mão -> token do tema
HEX_TOKENS = {
    '1C1418': 'ink', '160E12': 'shell-deep', '2E2428': 'shell-line', '251A20': 'shell-raised', '3E3036': 'shell-line',
    '3D3035': 'shell-line', '3A3034': 'ink-soft', '6E615B': 'muted', '8A7D77': 'subtle', '9A8B84': 'faint', 'A99C97': 'faint',
    'D8D0CC': 'shell-text', 'E5DAD3': 'line', 'E8DED8': 'line', 'E6DEDA': 'line', 'EFE6E0': 'line', 'C9BCB5': 'line-strong',
    'FAF5F1': 'canvas', 'F4EEEA': 'hover', 'F2EBE6': 'hover', 'E30A78': 'brand', 'D1096E': 'brand-dark', 'C20866': 'brand-dark',
    'B30A5C': 'brand-dark', 'A00952': 'brand-deep', '96084C': 'brand-deep', 'F5C6DC': 'brand-soft', 'FFF5FA': 'brand-tint',
    'FDECEF': 'rose-50', 'FFF4DB': 'amber-50', 'E8B54A': 'amber-300', '5C3800': 'amber-900', '8A5A00': 'amber-700',
    '7A4A00': 'amber-800', 'E8F7EE': 'emerald-50', '7BC79A': 'emerald-300', '14532D': 'emerald-900', 'F2A7B5': 'rose-300',
    '7F1D2D': 'rose-900', '64748B': 'slate-500',
}
hex_re = re.compile(r'-\[#([0-9A-Fa-f]{6})\]')


def fix_hex(m: re.Match) -> str:
    token = HEX_TOKENS.get(m.group(1).upper())
    return f'-{token}' if token else m.group(0)


SIMPLE = [
    (re.compile(r'\brounded-3xl\b'), 'rounded-2xl'),
    (re.compile(r'\bfont-black\b'), 'font-bold'),
    (re.compile(r'\bfont-extrabold\b'), 'font-semibold'),
    (re.compile(r'\bshadow-md\b'), 'shadow-sm'),
    (re.compile(r'\bshadow-lg\b'), 'shadow-sm'),
]

changed = 0
for f in FILES:
    src = f.read_text(encoding='utf-8')
    out = palette_re.sub(fix_palette, src)
    out = hex_re.sub(fix_hex, out)
    for pattern, repl in SIMPLE:
        out = pattern.sub(repl, out)
    if out != src:
        f.write_text(out, encoding='utf-8')
        changed += 1

left = {}
for f in FILES:
    for m in hex_re.finditer(f.read_text(encoding='utf-8')):
        left[m.group(1).upper()] = left.get(m.group(1).upper(), 0) + 1
print(f'arquivos alterados: {changed}')
print('cores à mão que ficaram:', left)
