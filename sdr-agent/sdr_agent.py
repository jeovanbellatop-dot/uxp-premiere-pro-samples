"""Agente SDR: enriquece uma lista de empresas com CNPJ, telefone e e-mail.

Uso:
    python sdr_agent.py lista.xlsx                # gera lista_lapidada.xlsx
    python sdr_agent.py lista.csv -o saida.csv --workers 6 --apenas-ativas
"""

import argparse
import json
import os
import re
import sys
import threading
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import anthropic
import pandas as pd

import cnpj as receita

MODELO = "claude-opus-5-5"
MAX_ITERACOES = 12

SYSTEM = """Você é um SDR (pré-vendas) brasileiro especialista em pesquisa de empresas.
Sua tarefa: dado o nome de uma empresa (e às vezes cidade, site ou outras pistas), \
encontrar os dados de contato comercial corretos.

Como trabalhar:
1. Pesquise na web o CNPJ da empresa (sites como cnpj.biz, casadosdados, econodata, \
cnpja, o site oficial da empresa, rodapés com "CNPJ", Google Maps, LinkedIn).
2. Sempre que encontrar um CNPJ candidato, chame a ferramenta consultar_cnpj para \
confirmar razão social, situação, telefone e e-mail na base da Receita Federal. \
Se a razão social/nome fantasia não bater com a empresa pedida, descarte e continue.
3. Se a Receita não trouxer telefone ou e-mail (ou trouxer de contador), procure no \
site oficial, Google Meu Negócio, redes sociais e diretórios. Prefira contatos \
comerciais da própria empresa (telefone fixo/WhatsApp de vendas, e-mail de contato).
4. Havendo várias empresas com o mesmo nome, use as pistas fornecidas para escolher; \
se não der para decidir, escolha a mais provável, use confiança "baixa" e explique.

5. Empresas grandes têm um CNPJ por filial: traga a matriz (0001), salvo se as pistas \
indicarem outra unidade. Se o grupo tiver outras empresas/marcas relevantes, cite na nota.

Regras: nunca invente dados. Campo não encontrado fica como string vazia. \
Telefones no formato (DD) NNNN-NNNN ou (DD) NNNNN-NNNN; 0800 como 0800 NNN NNNN. \
CNPJ no formato 00.000.000/0000-00.
Cada campo tem uma "nota" curta dizendo de onde veio o dado e o que o vendedor precisa \
saber, por exemplo: "diretórios de CNPJ, cadastro da sede", "central de relacionamento", \
"SAC – pedir contato de Compras", "contato nominal, listado no Sindifranca", \
"sede. Tem uma segunda fábrica em Cruz das Almas/BA". Deixe a nota vazia se não houver \
nada útil a dizer. Se duas fontes oficiais divergirem (ex.: dois WhatsApps), traga os \
dois e diga isso na nota.
Atividade no formato: "Fabricação de calçados de couro (CNAE 1531-9/01), aberta em 1966".
Confiança: "alta" quando CNPJ e contatos batem em fontes independentes ou oficiais; \
"media" quando algum dado depende de uma só fonte ou é de SAC; "baixa" quando houver \
dúvida sobre qual empresa é."""

FERRAMENTA_CNPJ = {
    "name": "consultar_cnpj",
    "description": (
        "Consulta um CNPJ na base pública da Receita Federal e devolve razão social, "
        "nome fantasia, situação cadastral, telefones, e-mail, município e UF. "
        "Use para confirmar todo CNPJ candidato antes de responder."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {"cnpj": {"type": "string", "description": "CNPJ com ou sem pontuação"}},
        "required": ["cnpj"],
        "additionalProperties": False,
    },
}

FERRAMENTAS = [
    {"type": "web_search_20260209", "name": "web_search", "max_uses": 8,
     "user_location": {"type": "approximate", "country": "BR"}},
    {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 6},
    FERRAMENTA_CNPJ,
]

_TEXTO = {"type": "string"}


def _com_nota(campo: str) -> dict:
    return {"type": "object", "properties": {campo: _TEXTO, "nota": _TEXTO},
            "required": [campo, "nota"], "additionalProperties": False}


_CAMPOS = {
    "razao_social": _TEXTO,
    "nome_fantasia": _TEXTO,
    "cnpj": _TEXTO,
    "telefone": _com_nota("numero"),
    "outros_telefones": {"type": "array", "items": _com_nota("numero")},
    "email": _com_nota("endereco"),
    "site": _TEXTO,
    "cidade": _TEXTO,
    "uf": _TEXTO,
    "nota_local": _TEXTO,
    "atividade": _TEXTO,
    "situacao_cadastral": _TEXTO,
    "confianca": {"type": "string", "enum": ["alta", "media", "baixa"]},
}
FORMATO_RESPOSTA = {
    "type": "json_schema",
    "schema": {"type": "object", "properties": _CAMPOS, "required": list(_CAMPOS),
               "additionalProperties": False},
}

# Modelo de ficha do lead (mesma ordem e nomes em toda saída)
COLUNAS_SAIDA = ["Razão Social", "Nome Fantasia", "CNPJ", "Telefone", "Outros Telefones",
                 "E-mail", "Site", "Cidade / UF", "Atividade", "Status Lead", "Confiança"]
CONFIANCA = {"alta": "Alta", "media": "Média", "baixa": "Baixa"}


def _normalizar(texto: str) -> str:
    t = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", t.lower())


def detectar_colunas(df: pd.DataFrame) -> tuple[str, str | None]:
    """Descobre qual coluna tem o nome da empresa e qual (se houver) tem o CNPJ."""
    norm = {c: _normalizar(c) for c in df.columns}
    col_cnpj = next((c for c, n in norm.items() if "cnpj" in n), None)
    for chave in ("empresa", "razaosocial", "nomefantasia", "company", "cliente", "nome", "razao"):
        col = next((c for c, n in norm.items() if chave in n and c != col_cnpj), None)
        if col:
            return col, col_cnpj
    return next(c for c in df.columns if c != col_cnpj), col_cnpj


def _executar_ferramenta(bloco) -> dict:
    if bloco.name == "consultar_cnpj":
        resultado = receita.consultar(bloco.input.get("cnpj", ""))
        return {"type": "tool_result", "tool_use_id": bloco.id,
                "content": json.dumps(resultado, ensure_ascii=False),
                "is_error": "erro" in resultado}
    return {"type": "tool_result", "tool_use_id": bloco.id,
            "content": f"Ferramenta desconhecida: {bloco.name}", "is_error": True}


def pesquisar_com_ia(client: anthropic.Anthropic, empresa: str, pistas: dict,
                     esforco: str) -> dict:
    """Roda o agente (busca na web + consulta à Receita) para uma empresa."""
    pedido = f"Empresa: {empresa}"
    if pistas:
        pedido += "\nInformações adicionais da lista:\n" + "\n".join(
            f"- {k}: {v}" for k, v in pistas.items())
    mensagens = [{"role": "user", "content": pedido}]

    for _ in range(MAX_ITERACOES):
        resposta = client.beta.messages.create(
            model=MODELO,
            max_tokens=16000,
            system=SYSTEM,
            tools=FERRAMENTAS,
            messages=mensagens,
            output_config={"effort": esforco, "format": FORMATO_RESPOSTA},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        mensagens.append({"role": "assistant", "content": resposta.content})

        if resposta.stop_reason == "tool_use":
            resultados = [_executar_ferramenta(b) for b in resposta.content
                          if b.type == "tool_use"]
            mensagens.append({"role": "user", "content": resultados})
            continue
        if resposta.stop_reason == "pause_turn":
            continue
        if resposta.stop_reason == "refusal":
            raise RuntimeError("o modelo recusou a pesquisa")
        if resposta.stop_reason == "max_tokens":
            raise RuntimeError("resposta cortada por limite de tokens")

        texto = next((b.text for b in resposta.content if b.type == "text"), "")
        return json.loads(texto)

    raise RuntimeError("limite de iterações atingido sem resposta final")


def _anotar(valor: str, nota: str) -> str:
    valor, nota = (valor or "").strip(), (nota or "").strip()
    return f"{valor} ({nota})" if valor and nota else valor


def _atividade_receita(oficial: dict) -> str:
    texto = oficial.get("atividade", "").capitalize()
    if oficial.get("cnae"):
        texto += f" (CNAE {receita.formatar_cnae(oficial['cnae'])})"
    if oficial.get("abertura"):
        texto += f", aberta em {oficial['abertura'][:4]}"  # data ISO: AAAA-MM-DD
    return texto


def _de_receita(oficial: dict) -> dict:
    """Monta a resposta só com os dados da Receita (quando eles bastam)."""
    tels = oficial.get("telefones", [])
    return {
        "razao_social": oficial["razao_social"], "nome_fantasia": oficial["nome_fantasia"],
        "cnpj": oficial["cnpj"],
        "telefone": {"numero": tels[0] if tels else "", "nota": "Receita Federal"},
        "outros_telefones": [{"numero": t, "nota": "Receita Federal"} for t in tels[1:]],
        "email": {"endereco": oficial["email"], "nota": "Receita Federal"},
        "site": "", "cidade": oficial["municipio"].title(), "uf": oficial["uf"],
        "nota_local": "", "atividade": _atividade_receita(oficial),
        "situacao_cadastral": oficial["situacao"], "confianca": "alta",
    }


def enriquecer(client: anthropic.Anthropic | None, empresa: str, cnpj_lista: str,
               pistas: dict, esforco: str) -> dict:
    """Devolve a ficha do lead (colunas de COLUNAS_SAIDA) para uma linha da lista."""
    oficial = {}
    if cnpj_lista and receita.valido(cnpj_lista):
        oficial = receita.consultar(cnpj_lista)
        if "erro" in oficial:
            oficial = {}

    if oficial and oficial.get("telefones") and oficial.get("email"):
        dados = _de_receita(oficial)
    elif client:
        if oficial:
            pistas = {**pistas, "CNPJ já confirmado na Receita": oficial["cnpj"],
                      "Dados da Receita": json.dumps(oficial, ensure_ascii=False)}
        dados = pesquisar_com_ia(client, empresa, pistas, esforco)
    elif oficial:
        dados = _de_receita(oficial)
    else:
        dados = {}

    cnpj_achado = dados.get("cnpj", "")
    nota_cnpj = ""
    confianca = dados.get("confianca", "")
    if cnpj_achado:
        if receita.valido(cnpj_achado):
            cnpj_achado = receita.formatar(cnpj_achado)
            nota_cnpj = "dígitos verificadores conferem"
            if oficial or "erro" not in receita.consultar(cnpj_achado):
                nota_cnpj += ", confirmado na Receita"
        else:
            nota_cnpj = "descartado: dígitos verificadores não conferem"
            cnpj_achado, confianca = "", "baixa"

    tel = dados.get("telefone") or {}
    outros = dados.get("outros_telefones") or []
    email = dados.get("email") or {}
    local = " / ".join(x for x in (dados.get("cidade", ""), dados.get("uf", "")) if x)

    if cnpj_achado and tel.get("numero") and email.get("endereco"):
        status = "Completo"
    elif cnpj_achado or tel.get("numero") or email.get("endereco"):
        status = "Parcial"
    else:
        status = "Não encontrado"

    return {
        "Razão Social": dados.get("razao_social", ""),
        "Nome Fantasia": dados.get("nome_fantasia", "") or empresa,
        "CNPJ": _anotar(cnpj_achado, nota_cnpj),
        "Telefone": _anotar(receita.formatar_telefone(tel.get("numero", "")), tel.get("nota")),
        "Outros Telefones": " · ".join(
            _anotar(receita.formatar_telefone(t["numero"]), t.get("nota"))
            for t in outros if t.get("numero")),
        "E-mail": _anotar(email.get("endereco", "").lower(), email.get("nota")),
        "Site": dados.get("site", ""),
        "Cidade / UF": _anotar(local, dados.get("nota_local")),
        "Atividade": dados.get("atividade", ""),
        "Status Lead": status,
        "Confiança": CONFIANCA.get(confianca, ""),
        "_situacao": dados.get("situacao_cadastral", ""),
    }


def _achar_cabecalho(df: pd.DataFrame) -> pd.DataFrame:
    """Planilhas com título no topo: usa como cabeçalho a 1ª linha que cita empresa/nome."""
    if any(_normalizar(c) in ("empresa", "nome", "razaosocial", "cnpj") for c in df.columns):
        return df
    for i, linha in df.head(20).iterrows():
        valores = [_normalizar(v) for v in linha.fillna("")]
        if any(v in ("empresa", "nome", "razaosocial", "nomedaempresa", "cnpj") for v in valores):
            novo = df.iloc[i + 1:].copy()
            novo.columns = [str(v).strip() or f"Coluna {j}" for j, v in enumerate(linha.fillna(""))]
            return novo
    return df


def ler_lista(caminho: Path, aba: str | None = None) -> pd.DataFrame:
    if caminho.suffix.lower() in (".xlsx", ".xls"):
        df = _achar_cabecalho(pd.read_excel(caminho, sheet_name=aba or 0, dtype=str))
    elif caminho.suffix.lower() == ".txt":
        nomes = [l.strip() for l in caminho.read_text(encoding="utf-8").splitlines() if l.strip()]
        df = pd.DataFrame({"Empresa": nomes})
    else:
        df = _achar_cabecalho(pd.read_csv(caminho, dtype=str, sep=None, engine="python",
                                          encoding="utf-8-sig"))
    df = df.fillna("").dropna(how="all")
    return df[df.apply(lambda r: any(str(v).strip() for v in r), axis=1)].reset_index(drop=True)


def salvar(df: pd.DataFrame, caminho: Path) -> None:
    if caminho.suffix.lower() == ".csv":
        df.to_csv(caminho, index=False, encoding="utf-8-sig", sep=";")
    else:
        df.to_excel(caminho, index=False)


def main() -> None:
    p = argparse.ArgumentParser(description="Agente SDR: lapida listas de empresas.")
    p.add_argument("entrada", type=Path, help="Lista em .xlsx, .csv ou .txt (um nome por linha)")
    p.add_argument("--aba", help="Nome da aba da planilha (padrão: a primeira)")
    p.add_argument("-o", "--saida", type=Path, help="Arquivo de saída (.xlsx ou .csv)")
    p.add_argument("--workers", type=int, default=4, help="Empresas pesquisadas em paralelo")
    p.add_argument("--esforco", default="medium", choices=["low", "medium", "high", "xhigh", "max"],
                   help="Profundidade da pesquisa (maior = mais preciso e mais caro)")
    p.add_argument("--apenas-ativas", action="store_true",
                   help="Remove empresas com situação cadastral diferente de ATIVA")
    p.add_argument("--sem-ia", action="store_true",
                   help="Só consulta a Receita para linhas que já têm CNPJ (sem custo de IA)")
    args = p.parse_args()

    df = ler_lista(args.entrada, args.aba)
    col_nome, col_cnpj = detectar_colunas(df)
    saida = args.saida or args.entrada.with_name(f"{args.entrada.stem}_lapidada.xlsx")
    cache_path = saida.with_suffix(".cache.json")
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    trava = threading.Lock()
    if not args.sem_ia and not (os.environ.get("ANTHROPIC_API_KEY")
                                or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        sys.exit("Defina a variável ANTHROPIC_API_KEY (ou use --sem-ia). Veja o README.")
    client = None if args.sem_ia else anthropic.Anthropic(max_retries=4)

    # Remove empresas repetidas antes de gastar pesquisa com elas
    chaves = df.apply(lambda r: _normalizar(r[col_cnpj]) if col_cnpj and receita.valido(r[col_cnpj])
                      else _normalizar(r[col_nome]), axis=1)
    duplicadas = chaves.duplicated()
    if duplicadas.any():
        print(f"Removendo {duplicadas.sum()} linha(s) duplicada(s).")
    df = df[~duplicadas].reset_index(drop=True)
    chaves = chaves[~duplicadas].reset_index(drop=True)
    print(f"{len(df)} empresa(s) | coluna de nome: '{col_nome}'"
          + (f" | coluna de CNPJ: '{col_cnpj}'" if col_cnpj else ""))

    def tarefa(i: int) -> tuple[int, dict]:
        chave = chaves[i]
        if chave in cache:
            return i, cache[chave]
        linha = df.iloc[i]
        pistas = {c: v for c, v in linha.items() if c not in (col_nome, col_cnpj) and str(v).strip()}
        try:
            dados = enriquecer(client, linha[col_nome], linha[col_cnpj] if col_cnpj else "",
                               pistas, args.esforco)
        except (anthropic.APIError, RuntimeError, json.JSONDecodeError) as e:
            return i, {"Status Lead": f"Erro: {e}"}
        if client is None:  # modo --sem-ia não é cacheado, para a IA poder completar depois
            return i, dados
        with trava:
            cache[chave] = dados
            cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        return i, dados

    resultados: dict[int, dict] = {}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futuros = [pool.submit(tarefa, i) for i in range(len(df))]
        for n, futuro in enumerate(as_completed(futuros), 1):
            i, dados = futuro.result()
            resultados[i] = dados
            print(f"[{n}/{len(df)}] {df.iloc[i][col_nome]}: {dados.get('Status Lead', '')} "
                  f"{dados.get('Telefone', '')} {dados.get('E-mail', '')}")

    enriquecido = pd.DataFrame([resultados[i] for i in range(len(df))],
                               columns=COLUNAS_SAIDA + ["_situacao"])
    enriquecido = enriquecido.fillna("")
    # Colunas que já existiam na lista: mantém o valor original onde nada foi encontrado
    repetidas = [c for c in COLUNAS_SAIDA if c in df.columns]
    for c in repetidas:
        enriquecido[c] = enriquecido[c].where(enriquecido[c] != "", df[c])
    final = pd.concat([df.drop(columns=repetidas), enriquecido], axis=1)
    if args.apenas_ativas:
        antes = len(final)
        final = final[final["_situacao"].str.upper().isin(["ATIVA", ""])]
        print(f"Filtro de ativas removeu {antes - len(final)} empresa(s).")
    final = final.drop(columns="_situacao")

    salvar(final, saida)
    resumo = final["Status Lead"].value_counts().to_dict()
    print(f"\nLista lapidada salva em: {saida}\nResumo: {resumo}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nInterrompido. Rode de novo para continuar de onde parou (cache).")
