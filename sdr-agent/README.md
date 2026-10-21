# Agente SDR – Lapidador de listas de empresas

Você entrega uma lista só com o **nome das empresas** (e, se tiver, cidade, site, CNPJ
ou outras colunas). O agente devolve a mesma lista **lapidada**, e todo lead segue o
mesmo modelo de ficha — cada dado com a origem entre parênteses:

| Campo | Exemplo |
|---|---|
| Razão Social | CALCADOS BIBI LTDA |
| Nome Fantasia | Bibi |
| CNPJ | 97.748.958/0001-05 (dígitos verificadores conferem) |
| Telefone | (51) 3512-3344 (diretórios de CNPJ, cadastro da sede) |
| Outros Telefones | (51) 3512-3399 (central de relacionamento) · (51) 99221-6500 (WhatsApp) |
| E-mail | atendimento@bibi.com.br |
| Site | bibi.com |
| Cidade / UF | Parobé / RS (sede. Tem uma segunda fábrica em Cruz das Almas/BA) |
| Atividade | Fabricação de calçados de couro (CNAE 1531-9/01), aberta em 1966 |
| Status Lead | `Completo`, `Parcial`, `Não encontrado` ou `Erro` |
| Confiança | `Alta`, `Média` ou `Baixa` |

As colunas originais da lista (ex.: Estande, Segmento) são mantidas antes da ficha.

## Como funciona

1. Lê a planilha (`.xlsx`, `.csv` ou `.txt` com um nome por linha) e descobre sozinho
   qual coluna tem o nome da empresa e qual tem o CNPJ (se existir).
2. Remove empresas duplicadas.
3. Se a linha já tem CNPJ válido, consulta direto na Receita (BrasilAPI, com
   publica.cnpj.ws de reserva). Se já vier telefone e e-mail, nem usa IA (custo zero).
4. Senão, o Claude pesquisa na web, acha o CNPJ candidato, **confirma na Receita** e,
   se faltar telefone/e-mail, busca no site oficial, Google Meu Negócio e diretórios.
   CNPJ com dígito verificador inválido é descartado — o agente não inventa dados.
5. Salva a lista nova e um cache: se parar no meio, é só rodar de novo que ele continua.

## Instalação

```bash
cd sdr-agent
pip install -r requirements.txt
export ANTHROPIC_API_KEY="sua-chave"     # Windows: set ANTHROPIC_API_KEY=sua-chave
```

A chave é criada em https://console.anthropic.com.

## Uso

```bash
python sdr_agent.py minha_lista.xlsx
# -> minha_lista_lapidada.xlsx

python sdr_agent.py minha_lista.csv -o leads.csv --workers 6
python sdr_agent.py minha_lista.xlsx --apenas-ativas    # remove baixadas/inaptas
python sdr_agent.py minha_lista.xlsx --esforco high     # pesquisa mais profunda
python sdr_agent.py minha_lista.xlsx --sem-ia           # só Receita, p/ quem já tem CNPJ
python sdr_agent.py bfshow.xlsx --aba "Prioridade comercial"  # escolhe a aba
```

Teste rápido com a lista de exemplo: `python sdr_agent.py exemplo_lista.csv`.

| Opção | O que faz |
|---|---|
| `--aba` | aba da planilha a usar (padrão: a primeira). Linhas de título no topo são puladas |
| `-o / --saida` | arquivo de saída (`.xlsx` ou `.csv`, CSV sai com `;` para abrir no Excel) |
| `--workers N` | quantas empresas pesquisar ao mesmo tempo (padrão 4) |
| `--esforco` | `low`, `medium` (padrão), `high`, `xhigh`, `max` — mais esforço = mais preciso e mais caro |
| `--apenas-ativas` | mantém só empresas com situação cadastral ATIVA |
| `--sem-ia` | não usa o Claude; só consulta a Receita nas linhas com CNPJ |

## Dicas

- Quanto mais pistas na lista (cidade, UF, site, segmento), mais certeira a busca —
  qualquer coluna extra é enviada ao agente como contexto.
- Revise as linhas com `Confiança = baixa`: geralmente são nomes que existem em
  várias empresas diferentes.
- Telefone/e-mail da Receita às vezes é do contador; o agente procura o contato
  comercial no site e coloca alternativas em `Outros Telefones` / `Observações`.
