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

Regras: nunca invente dados. Campo não encontrado fica como string vazia. \
Telefones no formato (DD) NNNNN-NNNN. CNPJ no formato 00.000.000/0000-00. \
Liste em "fontes" as URLs ou bases de onde tirou cada dado."""

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
FORMATO_RESPOSTA = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "properties": {
            "encontrada": {"type": "boolean"},
            "razao_social": _TEXTO,
            "nome_fantasia": _TEXTO,
            "cnpj": _TEXTO,
            "telefones": {"type": "array", "items": _TEXTO},
            "email": _TEXTO,
            "site": _TEXTO,
            "cidade": _TEXTO,
            "uf": _TEXTO,
            "confianca": {"type": "string", "enum": ["alta", "media", "baixa"]},
            "fontes": {"type": "array", "items": _TEXTO},
            "observacoes": _TEXTO,
        },
        "required": ["encontrada", "razao_social", "nome_fantasia", "cnpj", "telefones",
                     "email", "site", "cidade", "uf", "confianca", "fontes", "observacoes"],
        "additionalProperties": False,
    },
}

COLUNAS_SAIDA = ["Razão Social", "Nome Fantasia", "CNPJ", "Telefone", "Outros Telefones",
                 "E-mail", "Site", "Cidade", "UF", "Situação Cadastral", "Atividade",
                 "Status Lead", "Confiança", "Fontes", "Observações"]


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


def _juntar_telefones(*listas) -> list[str]:
    vistos, saida = set(), []
    for lista in listas:
        for tel in lista or []:
            tel = receita.formatar_telefone(tel)
            chave = re.sub(r"\D", "", tel)
            if chave and chave not in vistos:
                vistos.add(chave)
                saida.append(tel)
    return saida


def enriquecer(client: anthropic.Anthropic | None, empresa: str, cnpj_lista: str,
               pistas: dict, esforco: str) -> dict:
    """Devolve os campos de saída para uma linha da lista."""
    oficial = {}
    if cnpj_lista and receita.valido(cnpj_lista):
        oficial = receita.consultar(cnpj_lista)
        if "erro" in oficial:
            oficial = {}

    web = {}
    precisa_ia = not (oficial.get("telefones") and oficial.get("email"))
    if precisa_ia and client:
        if oficial:
            pistas = {**pistas, "CNPJ já confirmado na Receita": oficial["cnpj"],
                      "Dados da Receita": json.dumps(oficial, ensure_ascii=False)}
        web = pesquisar_com_ia(client, empresa, pistas, esforco)

    obs = [web.get("observacoes", "")] if web.get("observacoes") else []
    cnpj_web = web.get("cnpj", "")
    if cnpj_web and not receita.valido(cnpj_web):
        obs.append(f"CNPJ sugerido pela web descartado (inválido): {cnpj_web}")
        cnpj_web = ""
    if not oficial and cnpj_web:
        oficial = receita.consultar(cnpj_web)
        if "erro" in oficial:
            oficial = {}

    telefones = _juntar_telefones(oficial.get("telefones"), web.get("telefones"))
    email = oficial.get("email") or web.get("email", "")
    if web.get("email") and web["email"].lower() != email:
        obs.append(f"E-mail alternativo: {web['email']}")

    cnpj_final = oficial.get("cnpj") or (receita.formatar(cnpj_web) if cnpj_web else "")
    if cnpj_final and telefones and email:
        status = "Completo"
    elif cnpj_final or telefones or email:
        status = "Parcial"
    else:
        status = "Não encontrado"

    fontes = (["Receita Federal"] if oficial else []) + web.get("fontes", [])
    return {
        "Razão Social": oficial.get("razao_social") or web.get("razao_social", ""),
        "Nome Fantasia": oficial.get("nome_fantasia") or web.get("nome_fantasia", ""),
        "CNPJ": cnpj_final,
        "Telefone": telefones[0] if telefones else "",
        "Outros Telefones": ", ".join(telefones[1:]),
        "E-mail": email,
        "Site": web.get("site", ""),
        "Cidade": oficial.get("municipio") or web.get("cidade", ""),
        "UF": oficial.get("uf") or web.get("uf", ""),
        "Situação Cadastral": oficial.get("situacao", ""),
        "Atividade": oficial.get("atividade", ""),
        "Status Lead": status,
        "Confiança": "alta" if oficial and not web else web.get("confianca", ""),
        "Fontes": " | ".join(dict.fromkeys(fontes)),
        "Observações": " ".join(obs),
    }


def ler_lista(caminho: Path) -> pd.DataFrame:
    if caminho.suffix.lower() in (".xlsx", ".xls"):
        df = pd.read_excel(caminho, dtype=str)
    elif caminho.suffix.lower() == ".txt":
        nomes = [l.strip() for l in caminho.read_text(encoding="utf-8").splitlines() if l.strip()]
        df = pd.DataFrame({"Empresa": nomes})
    else:
        df = pd.read_csv(caminho, dtype=str, sep=None, engine="python", encoding="utf-8-sig")
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
    p.add_argument("-o", "--saida", type=Path, help="Arquivo de saída (.xlsx ou .csv)")
    p.add_argument("--workers", type=int, default=4, help="Empresas pesquisadas em paralelo")
    p.add_argument("--esforco", default="medium", choices=["low", "medium", "high", "xhigh", "max"],
                   help="Profundidade da pesquisa (maior = mais preciso e mais caro)")
    p.add_argument("--apenas-ativas", action="store_true",
                   help="Remove empresas com situação cadastral diferente de ATIVA")
    p.add_argument("--sem-ia", action="store_true",
                   help="Só consulta a Receita para linhas que já têm CNPJ (sem custo de IA)")
    args = p.parse_args()

    df = ler_lista(args.entrada)
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
            return i, {"Status Lead": "Erro", "Observações": f"Falha na pesquisa: {e}"}
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

    enriquecido = pd.DataFrame([resultados[i] for i in range(len(df))], columns=COLUNAS_SAIDA)
    enriquecido = enriquecido.fillna("")
    # Colunas que já existiam na lista: mantém o valor original onde nada foi encontrado
    repetidas = [c for c in COLUNAS_SAIDA if c in df.columns]
    for c in repetidas:
        enriquecido[c] = enriquecido[c].where(enriquecido[c] != "", df[c])
    final = pd.concat([df.drop(columns=repetidas), enriquecido], axis=1)
    if args.apenas_ativas:
        antes = len(final)
        final = final[final["Situação Cadastral"].str.upper().isin(["ATIVA", ""])]
        print(f"Filtro de ativas removeu {antes - len(final)} empresa(s).")

    salvar(final, saida)
    resumo = final["Status Lead"].value_counts().to_dict()
    print(f"\nLista lapidada salva em: {saida}\nResumo: {resumo}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nInterrompido. Rode de novo para continuar de onde parou (cache).")
