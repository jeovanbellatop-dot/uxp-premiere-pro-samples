"""Validação de CNPJ e consulta aos dados públicos da Receita Federal."""

import re

import requests

_SESSAO = requests.Session()
_SESSAO.headers["User-Agent"] = "sdr-agent/1.0"


def limpar(cnpj: str) -> str:
    return re.sub(r"\D", "", cnpj or "")


def _digito(base: str) -> str:
    pesos = list(range(len(base) - 7, 1, -1)) + list(range(9, 1, -1))
    soma = sum(int(d) * p for d, p in zip(base, pesos[-len(base):]))
    resto = soma % 11
    return "0" if resto < 2 else str(11 - resto)


def valido(cnpj: str) -> bool:
    """Confere os dígitos verificadores do CNPJ."""
    c = limpar(cnpj)
    if len(c) != 14 or c == c[0] * 14:
        return False
    d1 = _digito(c[:12])
    d2 = _digito(c[:12] + d1)
    return c[12:] == d1 + d2


def formatar(cnpj: str) -> str:
    c = limpar(cnpj)
    if len(c) != 14:
        return cnpj
    return f"{c[:2]}.{c[2:5]}.{c[5:8]}/{c[8:12]}-{c[12:]}"


def formatar_telefone(tel: str) -> str:
    d = re.sub(r"\D", "", tel or "")
    if d.startswith("55") and len(d) in (12, 13):
        d = d[2:]
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return (tel or "").strip()


def formatar_cnae(cnae: str) -> str:
    d = re.sub(r"\D", "", cnae or "")
    return f"{d[:4]}-{d[4]}/{d[5:]}" if len(d) == 7 else (cnae or "")


def _brasilapi(c: str) -> dict | None:
    r = _SESSAO.get(f"https://brasilapi.com.br/api/cnpj/v1/{c}", timeout=20)
    if r.status_code != 200:
        return None
    j = r.json()
    telefones = [t for t in (j.get("ddd_telefone_1"), j.get("ddd_telefone_2")) if t]
    return {
        "razao_social": j.get("razao_social") or "",
        "nome_fantasia": j.get("nome_fantasia") or "",
        "situacao": j.get("descricao_situacao_cadastral") or "",
        "telefones": [formatar_telefone(t) for t in telefones],
        "email": (j.get("email") or "").lower(),
        "municipio": j.get("municipio") or "",
        "uf": j.get("uf") or "",
        "atividade": j.get("cnae_fiscal_descricao") or "",
        "cnae": str(j.get("cnae_fiscal") or ""),
        "abertura": j.get("data_inicio_atividade") or "",
    }


def _publica_cnpj_ws(c: str) -> dict | None:
    r = _SESSAO.get(f"https://publica.cnpj.ws/cnpj/{c}", timeout=20)
    if r.status_code != 200:
        return None
    j = r.json()
    est = j.get("estabelecimento") or {}
    telefones = []
    for n in ("1", "2"):
        if est.get(f"telefone{n}"):
            telefones.append(formatar_telefone(f"{est.get(f'ddd{n}', '')}{est[f'telefone{n}']}"))
    return {
        "razao_social": j.get("razao_social") or "",
        "nome_fantasia": est.get("nome_fantasia") or "",
        "situacao": est.get("situacao_cadastral") or "",
        "telefones": telefones,
        "email": (est.get("email") or "").lower(),
        "municipio": (est.get("cidade") or {}).get("nome", ""),
        "uf": (est.get("estado") or {}).get("sigla", ""),
        "atividade": (est.get("atividade_principal") or {}).get("descricao", ""),
        "cnae": (est.get("atividade_principal") or {}).get("subclasse", ""),
        "abertura": est.get("data_inicio_atividade") or "",
    }


def consultar(cnpj: str) -> dict:
    """Consulta o CNPJ na Receita (BrasilAPI, com publica.cnpj.ws como reserva)."""
    c = limpar(cnpj)
    if not valido(c):
        return {"erro": f"CNPJ inválido (dígitos verificadores não conferem): {cnpj}"}
    for fonte in (_brasilapi, _publica_cnpj_ws):
        try:
            dados = fonte(c)
        except (requests.RequestException, ValueError):
            continue
        if dados:
            return {"cnpj": formatar(c), **dados}
    return {"erro": f"CNPJ {formatar(c)} não encontrado nas bases públicas"}
