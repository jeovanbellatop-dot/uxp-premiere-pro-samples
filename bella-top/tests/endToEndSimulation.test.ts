/**
 * Simulação ponta a ponta - Bella Top MES
 * Cada rodada cria OPs aleatórias (com layout e imagens), passa por todas as etapas,
 * troca de operador a cada máquina, disputa a fila compartilhada do Corte e Solda,
 * recarrega o aparelho no meio do fluxo e termina no despacho da Expedição.
 *
 * O "gabarito" abaixo vem das regras oficiais (server/memory.ts), escrito de forma
 * independente do código de roteamento, para que um erro nas regras apareça aqui.
 *
 * Uso: npx tsx tests/endToEndSimulation.test.ts [rodadas=50] [semente=1]
 * AMBIENTE ISOLADO: localStorage e fetch simulados, sem acesso ao Firebase.
 */

import './offlineFirebaseKey';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Ambiente isolado
// ---------------------------------------------------------------------------
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(global as any).localStorage = new MemStorage();
(global as any).fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' });

const ROUNDS = Number(process.argv[2] || 50);
const SEED = Number(process.argv[3] || 1);

let seed = SEED;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
const shuffle = <T,>(a: T[]): T[] => a.map((v) => [rnd(), v] as const).sort((x, y) => x[0] - y[0]).map(([, v]) => v);

// ---------------------------------------------------------------------------
// Usuários da fábrica
// ---------------------------------------------------------------------------
const PASSWORD = 'Senha@123';
const mkUser = (id: string, name: string, login: string, role: string, sectors: string[], machines: string[]) => {
  const salt = 'salt_' + id;
  return {
    id, name, login, username: login, role, sectors, authorizedMachineIds: machines, isActive: true,
    passwordSalt: salt, passwordHash: crypto.scryptSync(PASSWORD, salt, 64).toString('hex'),
  };
};
const USERS = [
  mkUser('u_admin', 'Admin Bella', 'admin', 'ADMIN', ['ADMIN'], []),
  mkUser('u_pcp', 'Paula PCP', 'paula', 'PCP', ['PCP'], []),
  mkUser('u_welton', 'Welton', 'welton', 'OPERATOR', ['REFILE'], ['REFILADEIRA_01']),
  mkUser('u_gabriel', 'Gabriel', 'gabriel', 'OPERATOR', ['FLEXOGRAFIA'], ['FLEXOGRAFIA_01']),
  mkUser('u_viola', 'Viola', 'viola', 'OPERATOR', ['ESTAMPARIA'], ['CARROSSEL_01', 'CARROSSEL_PEQUENA_01']),
  mkUser('u_toninho', 'Toninho', 'toninho', 'OPERATOR', ['CORTE_SOLDA'], ['m2-corte-solda', 'm3-corte-solda', 'm4-corte-solda']),
  mkUser('u_joao', 'João M2', 'joao', 'OPERATOR', ['CORTE_SOLDA'], ['m2-corte-solda']),
  mkUser('u_bia', 'Bia Acabamento', 'bia', 'OPERATOR', ['ALCA'], ['workstation_proc_colocar_alca', 'workstation_proc_cordao_manual', 'workstation_proc_costura']),
  mkUser('u_terc', 'Recebimento Terceirizado', 'terceiro', 'OPERATOR', ['ALCA'], ['workstation_proc_terceirizado']),
  mkUser('u_carlos', 'Carlos', 'carlos', 'EXPEDITION', ['EXPEDICAO'], ['workstation_proc_expedicao']),
];

// ---------------------------------------------------------------------------
// Gabarito oficial (server/memory.ts)
// ---------------------------------------------------------------------------
type ProductKind = 'FITA' | 'VAZADA' | 'SACO_VISOR' | 'SACO_SEM_VISOR' | 'MOCHILINHA' | 'SACOLA_PRESENTE' | 'SACO_PRESENTE' | 'BOX' | 'ECOBAG' | 'LIXO_CAR' | 'SAQUINHO';
const KINDS: Record<ProductKind, { name: string; handle: string; visor: boolean; flow: 'PADRAO' | 'ECOBAG' | 'TERC'; handleStep: boolean; sewing: boolean; fixedManualCord: boolean }> = {
  FITA: { name: 'Sacola TNT Alça Fita Sem Visor', handle: 'FITA', visor: false, flow: 'PADRAO', handleStep: true, sewing: false, fixedManualCord: false },
  VAZADA: { name: 'Sacola TNT Alça Vazada Sem Visor', handle: 'VAZADA', visor: false, flow: 'PADRAO', handleStep: false, sewing: false, fixedManualCord: false },
  SACO_VISOR: { name: 'Saco TNT Visor Cristal', handle: 'NENHUMA', visor: true, flow: 'PADRAO', handleStep: false, sewing: false, fixedManualCord: false },
  SACO_SEM_VISOR: { name: 'Saco TNT Sem Visor', handle: 'NENHUMA', visor: false, flow: 'PADRAO', handleStep: false, sewing: false, fixedManualCord: false },
  MOCHILINHA: { name: 'Mochilinha TNT', handle: 'CORDAO', visor: false, flow: 'PADRAO', handleStep: false, sewing: false, fixedManualCord: true },
  SACOLA_PRESENTE: { name: 'Sacola Presente TNT', handle: 'FITA', visor: false, flow: 'PADRAO', handleStep: true, sewing: false, fixedManualCord: true },
  SACO_PRESENTE: { name: 'Saco Presente TNT', handle: 'NENHUMA', visor: false, flow: 'PADRAO', handleStep: false, sewing: false, fixedManualCord: true },
  BOX: { name: 'Sacola Box TNT', handle: 'FITA', visor: false, flow: 'PADRAO', handleStep: true, sewing: true, fixedManualCord: false },
  ECOBAG: { name: 'Ecobag Algodão', handle: 'NENHUMA', visor: false, flow: 'ECOBAG', handleStep: false, sewing: false, fixedManualCord: false },
  LIXO_CAR: { name: 'Lixo Car TNT', handle: 'NENHUMA', visor: false, flow: 'PADRAO', handleStep: false, sewing: false, fixedManualCord: false },
  SAQUINHO: { name: 'Saquinho Algodão', handle: 'NENHUMA', visor: false, flow: 'TERC', handleStep: false, sewing: false, fixedManualCord: false },
};
const SIZES: Record<string, [number, number]> = { P: [200, 300], M: [300, 400], G: [400, 500], GG: [500, 600], '8x12': [80, 120] };

interface Scenario {
  kind: ProductKind; size: string; printing: 'FLEXOGRAFIA' | 'SERIGRAFIA' | 'SEM_IMPRESSAO';
  cord: 'NENHUM' | 'AUTOMATICO' | 'MANUAL'; client: string; qty: number;
  layout: 'url' | 'base64' | 'none'; lowConfidence: boolean;
}

function expectedCordMode(s: Scenario): string {
  const k = KINDS[s.kind];
  if (k.flow !== 'PADRAO') return 'NENHUM';
  if (k.fixedManualCord) return 'MANUAL';
  if (s.cord !== 'NENHUM' && /arezzo|anacapri|sonho dos pes/i.test(s.client)) return 'MANUAL';
  return s.cord;
}

function expectedSteps(s: Scenario): string[] {
  const k = KINDS[s.kind];
  if (k.flow === 'ECOBAG') return ['proc_serigrafia', 'proc_expedicao'];
  if (k.flow === 'TERC') return ['proc_terceirizado', 'proc_serigrafia', 'proc_expedicao'];
  const ids = s.printing === 'FLEXOGRAFIA' ? ['proc_flexografia', 'proc_solda']
    : s.printing === 'SERIGRAFIA' ? ['proc_refile', 'proc_solda', 'proc_serigrafia'] : ['proc_refile', 'proc_solda'];
  if (k.sewing) ids.push('proc_costura');
  if (expectedCordMode(s) === 'MANUAL') ids.push('proc_passar_fio');
  if (k.handleStep) ids.push('proc_colocar_alca');
  ids.push('proc_expedicao');
  return ids;
}

/** Máquinas de Corte e Solda permitidas pela matriz oficial. */
function allowedCorte(s: Scenario): string[] {
  const visor = KINDS[s.kind].visor;
  if (s.size === '8x12') return ['m3-corte-solda'];
  if (expectedCordMode(s) === 'AUTOMATICO') return ['m3-corte-solda'];
  const ok: string[] = [];
  if (!['G', 'GG'].includes(s.size)) ok.push('m2-corte-solda');
  ok.push('m3-corte-solda');
  if (!visor) ok.push('m4-corte-solda');
  return ok;
}

/** Cliente com cordão manual fixo, mas OP sem cordão: o sistema pede confirmação do PCP. */
function expectsPcpReview(s: Scenario): boolean {
  const k = KINDS[s.kind];
  const clientRule = /arezzo|anacapri|sonho dos pes/i.test(s.client) && k.flow === 'PADRAO' && !k.fixedManualCord && s.cord === 'NENHUM';
  return s.lowConfidence || clientRule;
}

function genScenario(): Scenario {
  const kind = pick(Object.keys(KINDS) as ProductKind[]);
  const k = KINDS[kind];
  const cordable = !k.fixedManualCord && k.flow === 'PADRAO' && kind !== 'SACO_VISOR';
  return {
    kind,
    size: pick(['P', 'M', 'G', 'GG', 'M', '8x12']),
    printing: k.flow === 'PADRAO' ? pick(['FLEXOGRAFIA', 'SERIGRAFIA', 'SEM_IMPRESSAO'] as const) : 'SERIGRAFIA',
    cord: cordable && chance(0.3) ? pick(['AUTOMATICO', 'MANUAL'] as const) : 'NENHUM',
    client: pick(['Loja Aurora', 'Arezzo', 'Mercado Bom Preço', 'Anacapri', 'Farmácia Vida']),
    qty: pick([500, 1000, 2500, 5000, 12000]),
    layout: pick(['url', 'url', 'base64', 'none'] as const),
    lowConfidence: chance(0.15),
  };
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------
const errors: string[] = [];
let checks = 0;
const check = (cond: any, msg: string) => { checks++; if (!cond) errors.push(msg); return Boolean(cond); };
const expectThrow = (fn: () => any, msg: string) => {
  let threw = false;
  try { const r = fn(); if (r && r.success === false) threw = true; } catch { threw = true; }
  check(threw, msg);
};

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function main() {
  const { mesStore } = await import('../src/services/mesStore');
  const { OpAnalyzer } = await import('../server/opAnalyzer');
  const Store = mesStore.constructor as any;
  let store: any = mesStore;
  store.users = USERS.map((u) => ({ ...u }));

  const login = (userId: string, machineId: string) => {
    store.logoutMachineOperator();
    const u = USERS.find((x) => x.id === userId)!;
    const r = store.loginMachineOperator(machineId, u.login, PASSWORD);
    return r;
  };
  const operatorFor = (machineId: string) =>
    USERS.find((u) => u.role === 'OPERATOR' && u.authorizedMachineIds.includes(machineId) && u.id !== 'u_joao');

  let opSeq = 9000;
  for (let round = 1; round <= ROUNDS; round++) {
    const s = genScenario();
    const tag = `R${round} OP ${opSeq + 1} [${s.kind} ${s.size} ${s.printing} cordão=${s.cord} ${s.client}]`;
    const opNumber = String(++opSeq);
    const [w, h] = SIZES[s.size];

    // ---------- 0. Leitura do PDF da OP pelo servidor (modo sem IA) ----------
    {
      const kk = KINDS[s.kind];
      const printTxt = s.printing === 'FLEXOGRAFIA' ? 'Flexografia 1 cor' : s.printing === 'SERIGRAFIA' ? 'Serigrafia 1 cor' : 'Sem impressão (liso)';
      const cordTxt = s.cord === 'AUTOMATICO' ? '\nAcabamento: Cordão automático' : s.cord === 'MANUAL' ? '\nAcabamento: Cordão manual' : '';
      const pdfText = `ORDEM DE PRODUÇÃO\nOP: ${opSeq + 1}\nCliente: ${s.client}\nProduto: ${kk.name}\nQuantidade: ${s.qty} unidades\nGramatura: 60 g\nMedidas: ${s.size === '8x12' ? '8x12' : SIZES[s.size].join(' x ')}\nImpressão: ${printTxt}${cordTxt}\nPrazo: 25/12/2026`;
      const docs = s.layout === 'none' ? [] : [{ base64: TINY_PNG.split(',')[1], mimeType: 'image/png', fileName: 'layout.png', type: 'layout_document' }];
      try {
        const out: any = OpAnalyzer.runDeterministicFallback(pdfText, docs);
        const ptag = `R${round} OP ${opSeq + 1} [${s.kind} ${s.size} ${s.printing}] leitura do PDF`;
        check(out.op.op_number === String(opSeq + 1), `${ptag}: número da OP lido como "${out.op.op_number}"`);
        check(out.op.customer === s.client, `${ptag}: cliente lido como "${out.op.customer}"`);
        check(out.op.quantity === s.qty, `${ptag}: quantidade lida como ${out.op.quantity}`);
        check(out.op.has_window === kk.visor, `${ptag}: visor lido como ${out.op.has_window} (produto "${kk.name}")`);
        check(out.op.printing_method === s.printing, `${ptag}: impressão lida como ${out.op.printing_method}`);
        if (s.size === '8x12') check(out.op.size === '8x12', `${ptag}: tamanho 8x12 lido como ${out.op.size}`);
        const solda = (out.suggested_route || []).find((x: any) => x.processTypeId === 'proc_solda');
        if (solda && kk.flow === 'PADRAO' && !(s.cord !== 'NENHUM' && /arezzo|anacapri/i.test(s.client))) {
          const map: Record<string, string> = { mach_corte_2: 'm2-corte-solda', mach_corte_3: 'm3-corte-solda', mach_corte_4: 'm4-corte-solda' };
          const allowedSrv = allowedCorte({ ...s, size: out.op.size === 'G' && s.size === 'GG' ? 'GG' : s.size });
          check(allowedSrv.includes(map[solda.suggestedMachineId]), `${ptag}: servidor sugeriu ${solda.suggestedMachineName}, regra permite ${allowedSrv.join(', ')}`);
        }
      } catch (e: any) {
        check(false, `R${round} leitura do PDF falhou: ${e.message}`);
      }
    }

    // ---------- 1. PCP lança a OP (PDF + layout + imagens) ----------
    store.logoutMachineOperator();
    const images =
      s.layout === 'url'
        ? [
            { id: 'img1', type: 'layout_aprovado', isPrimaryLayout: true, urlOrBase64: `/api/files/op_${opNumber}/layout.png`, name: 'layout.png' },
            { id: 'img2', type: 'foto_produto', urlOrBase64: `/api/files/op_${opNumber}/foto.jpg`, name: 'foto.jpg' },
          ]
        : s.layout === 'base64'
        ? [{ id: 'img1', type: 'layout_aprovado', isPrimaryLayout: true, urlOrBase64: TINY_PNG, name: 'layout.png' }]
        : [];
    const k = KINDS[s.kind];
    const opData: any = {
      numeroOp: opNumber, numeroPedido: 'PED-' + opNumber, cliente: s.client,
      produtoNome: k.name, codigoProduto: '', modelo: k.name, quantidade: s.qty, unidade: 'UNIDADES',
      material: k.flow === 'PADRAO' ? 'TNT' : 'Algodão', gramatura: 60, corMaterial: 'Branco',
      larguraMm: w, alturaMm: h, fundoMm: 0, medidasFormatadas: s.size === '8x12' ? '8x12' : `${w}x${h}`, tamanho: s.size,
      tipoImpressao: s.printing, numeroCores: 1, impressaoFrente: 'Logo', impressaoVerso: '', personalizacao: '',
      tipoAlca: k.handle, usoCordao: s.cord !== 'NENHUM' || k.fixedManualCord, tipoCordao: s.cord === 'NENHUM' ? (k.fixedManualCord ? undefined : 'NENHUM') : s.cord,
      usoVisor: k.visor, acabamentos: [], observacoesTecnicas: '',
      prazoEntrega: new Date(Date.now() + 5 * 86400000).toISOString(),
      confiancaLeitura: { geral: s.lowConfidence ? 60 : 95, numeroOp: 99, cliente: 99, produto: 95, quantidade: 99, gramatura: 90, medidas: 90, tipoImpressao: 90, prazo: 90 },
      precisaRevisaoPcp: s.lowConfidence,
      images, opFileName: `OP_${opNumber}.pdf`,
      layoutFileName: s.layout === 'none' ? undefined : 'layout.png',
    };

    let order: any;
    try {
      order = store.createOrderFromExtracted(opData);
    } catch (e: any) {
      check(false, `${tag}: falhou ao criar a OP: ${e.message}`);
      continue;
    }
    expectThrow(() => store.createOrderFromExtracted(opData), `${tag}: OP duplicada foi aceita`);

    const gotSteps = order.steps.map((x: any) => x.processTypeId);
    const expSteps = expectedSteps(s);
    if (!check(JSON.stringify(gotSteps) === JSON.stringify(expSteps), `${tag}: roteiro errado. Esperado ${expSteps.join('→')}, veio ${gotSteps.join('→')}`)) continue;
    check(order.cordMode === expectedCordMode(s), `${tag}: cordão esperado ${expectedCordMode(s)}, veio ${order.cordMode}`);
    check(order.layoutStatus === (s.layout === 'none' ? 'LAYOUT_PENDENTE' : 'COMPLETO'), `${tag}: status do layout ${order.layoutStatus}`);
    const layoutAtCreation = order.layoutImage;
    if (s.layout === 'url') check(layoutAtCreation === images[0].urlOrBase64, `${tag}: layout principal não ficou na OP`);

    // ---------- 2. Revisão do PCP ----------
    // O botão "Liberar" do PCP confere as mesmas regras da criação: nenhuma surpresa depois.
    const releaseIssues = store.getReleaseIssues(opData);
    check((releaseIssues.length > 0) === (order.status === 'REVISAO_PCP'), `${tag}: conferência do botão Liberar (${releaseIssues.length} pendências) não bate com o status da OP (${order.status})`);
    // A fábrica só enxerga OP liberada.
    const inFactoryView = () => {
      const machines = store.getAllFactoryMachines().map((m: any) => m.id);
      const inQueues = machines.some((m: string) => {
        const op = USERS.find((u) => u.authorizedMachineIds.includes(m) && u.role !== 'ADMIN');
        if (!op) return false;
        login(op.id, m);
        const seen =
          store.getMachineQueue(m).some((q: any) => q.order.id === order.id) ||
          store.getAvailableCorteSoldaOps(m).some((q: any) => q.order.id === order.id) ||
          store.getOrdersForUser().some((o: any) => o.id === order.id);
        return seen;
      });
      store.logoutMachineOperator();
      return inQueues;
    };
    if (order.status === 'REVISAO_PCP') {
      check(expectsPcpReview(s), `${tag}: OP caiu em revisão do PCP sem motivo (${order.revisionNotes || ''})`);
      check(!inFactoryView(), `${tag}: OP em revisão do PCP apareceu numa fila da fábrica`);
      expectThrow(() => { login('u_welton', 'REFILADEIRA_01'); return store.startOperation(order.steps[0].id, order.steps[0].assignedMachineId, 'u_welton'); }, `${tag}: etapa iniciou com OP em revisão do PCP`);
      store.logoutMachineOperator();
      store.approveOpRoute(order.id);
      check(inFactoryView(), `${tag}: OP liberada pelo PCP não apareceu na fábrica`);
    } else {
      check(!expectsPcpReview(s), `${tag}: OP deveria ir para revisão do PCP e não foi`);
    }
    check(order.status === 'PROGRAMADA', `${tag}: OP não ficou PROGRAMADA após liberação (${order.status})`);

    // Segunda etapa não pode começar antes da primeira
    if (order.steps.length > 1 && order.steps[1].assignedMachineId) {
      const m = order.steps[1].assignedMachineId;
      const op = operatorFor(m);
      if (op) {
        login(op.id, m);
        expectThrow(() => store.startOperation(order.steps[1].id, m, op.id), `${tag}: etapa ${order.steps[1].processName} iniciou fora da sequência`);
      }
    }

    // ---------- 3. Chão de fábrica ----------
    const reloadAt = Math.floor(rnd() * order.steps.length);
    let expectedReceived = s.qty;
    for (let i = 0; i < order.steps.length; i++) {
      order = store.getOrders().find((o: any) => o.id === 'op_' + opNumber);
      const step = order.steps[i];
      const stag = `${tag} etapa ${i + 1} ${step.processName}`;
      check(step.receivedQuantity === expectedReceived, `${stag}: recebeu ${step.receivedQuantity}, esperado ${expectedReceived}`);
      check(step.status === 'PRONTA', `${stag}: deveria estar PRONTA, está ${step.status}`);

      let machineId: string | null = step.assignedMachineId;
      let operatorId: string;

      if (step.processTypeId === 'proc_solda') {
        // Fila compartilhada M2/M3/M4: operadores tentam pegar a OP em ordem aleatória
        const allowed = allowedCorte(s);
        expectThrow(() => login('u_toninho', 'm1-corte-solda'), `${stag}: login aceito na Máquina 1 (inativa)`);
        const tried: string[] = [];
        machineId = null;
        for (const m of shuffle(['m2-corte-solda', 'm3-corte-solda', 'm4-corte-solda'])) {
          const opUser = m === 'm2-corte-solda' && chance(0.5) ? 'u_joao' : 'u_toninho';
          check(login(opUser, m).success, `${stag}: ${opUser} não conseguiu entrar na ${m}`);
          const listed = store.getAvailableCorteSoldaOps(m).find((x: any) => x.step.id === step.id);
          // A fila só mostra as OPs que aquela máquina pode fazer.
          check(Boolean(listed) === allowed.includes(m), `${stag}: fila da ${m} ${listed ? 'mostra' : 'esconde'} a OP, mas a regra permite ${allowed.join(', ')}`);
          const res = store.claimOperation(step.id, m, opUser, USERS.find((u) => u.id === opUser)!.name);
          tried.push(m);
          if (res.success) {
            check(allowed.includes(m), `${stag}: ${m} aceitou a OP, mas a regra permite só ${allowed.join(', ')}`);
            machineId = m; operatorId = opUser;
            break;
          } else {
            check(!allowed.includes(m), `${stag}: ${m} recusou a OP ("${res.error}"), mas a regra permite ${allowed.join(', ')}`);
          }
        }
        if (!check(machineId, `${stag}: nenhuma máquina aceitou a OP (tentou ${tried.join(', ')})`)) break;
        // Outra máquina não pode "roubar" a OP já selecionada
        const other = ['m2-corte-solda', 'm3-corte-solda', 'm4-corte-solda'].find((m) => m !== machineId && allowed.includes(m));
        if (other) {
          const keepOp = operatorId!;
          login('u_toninho', other);
          check(!store.claimOperation(step.id, other, 'u_toninho', 'Toninho').success, `${stag}: ${other} roubou a OP já selecionada por ${machineId}`);
          login(keepOp, machineId!);
        }
      } else if (step.processTypeId === 'proc_expedicao') {
        // Mesmo caminho do botão "Expedição" da tela de entrada.
        const r = login('u_carlos', 'workstation_proc_expedicao');
        check(r.success, `${stag}: Carlos não conseguiu entrar na Expedição (${r.error})`);
        check(store.getSelectedSector() === 'EXPEDICAO', `${stag}: posto da Expedição não abriu o setor EXPEDICAO (${store.getSelectedSector()})`);
        operatorId = 'u_carlos';
      } else {
        check(machineId, `${stag}: etapa sem máquina definida`);
        const op = operatorFor(machineId!);
        if (!check(op, `${stag}: nenhum operador cadastrado para ${machineId}`)) break;
        // Operador de outro setor não pode entrar nesta máquina
        const intruder = USERS.find((u) => u.role === 'OPERATOR' && !u.authorizedMachineIds.includes(machineId!))!;
        expectThrow(() => login(intruder.id, machineId!), `${stag}: ${intruder.name} entrou na ${machineId} sem autorização`);
        check(login(op.id, machineId!).success, `${stag}: ${op.name} não conseguiu entrar na ${machineId}`);
        operatorId = op.id;
      }

      // Início (mesmo formato de chamada da tela)
      try {
        if (step.processTypeId === 'proc_expedicao') store.startOperation(step.id, undefined, operatorId!);
        else store.startOperation(step.id, machineId!, operatorId!);
      } catch (e: any) {
        check(false, `${stag}: não iniciou: ${e.message}`);
        break;
      }
      order = store.getOrders().find((o: any) => o.id === 'op_' + opNumber);
      check(order.steps[i].status === 'PRODUZINDO', `${stag}: status após início ${order.steps[i].status}`);

      // Fila: iniciada, some de todas as filas; na próxima máquina aparece sem poder iniciar.
      {
        const keepUser = operatorId!;
        const keepMachine = machineId;
        const allMachines = store.getAllFactoryMachines().map((m: any) => m.id);
        const queuesWithOp = (stepId: string) =>
          allMachines.filter((m: string) =>
            store.getMachineQueue(m).some((q: any) => q.step.id === stepId) ||
            store.getAvailableCorteSoldaOps(m).some((q: any) => q.step.id === stepId)
          );
        store.logoutMachineOperator();
        const stillListed = queuesWithOp(step.id);
        check(stillListed.length === 0, `${stag}: OP iniciada continua na fila de ${stillListed.join(', ')}`);
        const next = order.steps[i + 1];
        if (next && next.processTypeId !== 'proc_expedicao') {
          const nextMachines = next.processTypeId === 'proc_solda' ? allowedCorte(s) : [next.assignedMachineId];
          for (const nm of nextMachines) {
            store.logoutMachineOperator();
            const item =
              store.getMachineQueue(nm).find((q: any) => q.step.id === next.id) ||
              store.getAvailableCorteSoldaOps(nm).find((q: any) => q.step.id === next.id);
            if (!check(item, `${stag}: próxima etapa (${next.processName}) não aparece na fila de ${nm} enquanto a OP roda aqui`)) continue;
            check(!item.ready && /Em produção em/.test(item.waitingOn || ''), `${stag}: na fila de ${nm} a OP deveria aparecer "Em produção em ${step.processName}", veio ready=${item.ready} "${item.waitingOn}"`);
            if (next.processTypeId === 'proc_solda') {
              login('u_toninho', nm);
              check(!store.claimOperation(next.id, nm, 'u_toninho', 'Toninho').success, `${stag}: ${nm} conseguiu pegar a OP antes da etapa anterior terminar`);
            }
          }
        }
        if (keepMachine && step.processTypeId !== 'proc_expedicao') login(keepUser, keepMachine);
        else { store.logoutMachineOperator(); store.login('carlos', PASSWORD); }
      }
      check(order.steps[i].activeOperatorId === operatorId!, `${stag}: operador registrado ${order.steps[i].activeOperatorId}, esperado ${operatorId!}`);
      if (machineId && step.processTypeId !== 'proc_expedicao') {
        const mach = store.getAllFactoryMachines().find((m: any) => m.id === machineId);
        check(mach?.status === 'PRODUZINDO', `${stag}: máquina ${machineId} não ficou PRODUZINDO`);
        expectThrow(() => store.updateStepMachine(step.id, machineId), `${stag}: PCP trocou a máquina com a etapa produzindo`);
      }

      if (chance(0.3) && step.processTypeId !== 'proc_expedicao') {
        expectThrow(() => store.pauseOperation(step.id, '', machineId!, operatorId!), `${stag}: pausa sem motivo foi aceita`);
        try {
          store.pauseOperation(step.id, 'Troca de bobina', machineId!, operatorId!);
          store.resumeOperation(step.id, machineId!, operatorId!);
        } catch (e: any) { check(false, `${stag}: pausa/retomada falhou: ${e.message}`); }
      }

      // Apontamento
      const received = order.steps[i].receivedQuantity;
      const bigLoss = chance(0.1);
      const loss = bigLoss ? Math.ceil(received * 0.06) : chance(0.6) ? Math.floor(received * rnd() * 0.03) : 0;
      const finishArgs = step.processTypeId === 'proc_expedicao' ? [undefined, operatorId!] : [machineId!, operatorId!];
      expectThrow(() => store.finishOperation(step.id, { producedQuantity: received, lossQuantity: received + 1, lossReason: 'x' }, ...finishArgs), `${stag}: perda maior que o produzido foi aceita`);
      // A 1ª etapa pode produzir acima da OP (sobra de bobina); as seguintes não passam do lote recebido.
      if (i > 0) expectThrow(() => store.finishOperation(step.id, { producedQuantity: received + 10, lossQuantity: 0 }, ...finishArgs), `${stag}: apontou mais que o lote recebido`);
      if (loss > 0) expectThrow(() => store.finishOperation(step.id, { producedQuantity: received, lossQuantity: loss }, ...finishArgs), `${stag}: perda sem motivo foi aceita`);
      const alertsBefore = store.getAlerts().length;
      try {
        store.finishOperation(step.id, { producedQuantity: received, lossQuantity: loss, lossReason: loss ? 'Falha de solda' : undefined, lossClassification: loss ? 'REFUGO' : undefined }, ...finishArgs);
      } catch (e: any) {
        check(false, `${stag}: não finalizou: ${e.message}`);
        break;
      }
      order = store.getOrders().find((o: any) => o.id === 'op_' + opNumber);
      const done = order.steps[i];
      check(done.status === 'FINALIZADA', `${stag}: status após fim ${done.status}`);
      check(done.goodQuantity === received - loss, `${stag}: boas ${done.goodQuantity}, esperado ${received - loss}`);
      if (bigLoss && loss > s.qty * 0.05) check(store.getAlerts().length > alertsBefore, `${stag}: perda alta sem alerta`);
      if (machineId && step.processTypeId !== 'proc_expedicao') {
        const mach = store.getAllFactoryMachines().find((m: any) => m.id === machineId);
        check(mach?.status === 'DISPONIVEL', `${stag}: máquina ${machineId} não foi liberada (${mach?.status})`);
      }
      expectedReceived = received - loss;

      // Imagens acompanham a OP por todas as máquinas
      if (s.layout === 'url') {
        check(order.layoutImage === layoutAtCreation, `${stag}: layout da OP mudou/sumiu`);
        check((order.layoutImages || []).length === images.length, `${stag}: imagens anexadas sumiram (${(order.layoutImages || []).length}/${images.length})`);
      }

      // Recarga do aparelho (outro tablet abrindo o sistema) no meio do fluxo
      if (i === reloadAt) {
        const reloaded = new Store();
        const ro = reloaded.getOrders().find((o: any) => o.id === 'op_' + opNumber);
        if (check(ro, `${stag}: OP sumiu após recarregar o aparelho`)) {
          check(JSON.stringify(ro.steps.map((x: any) => [x.status, x.receivedQuantity, x.goodQuantity])) === JSON.stringify(order.steps.map((x: any) => [x.status, x.receivedQuantity, x.goodQuantity])), `${stag}: etapas diferentes após recarregar o aparelho`);
          if (s.layout === 'url') check(ro.layoutImage === layoutAtCreation, `${stag}: layout perdido após recarregar o aparelho`);
          check(ro.layoutStatus === order.layoutStatus, `${stag}: status do layout mudou após recarregar`);
        }
        if (reloaded.syncIntervalTimer) clearInterval(reloaded.syncIntervalTimer);
      }
    }

    // ---------- 4. Expedição / despacho ----------
    order = store.getOrders().find((o: any) => o.id === 'op_' + opNumber);
    if (order.steps.some((x: any) => x.status !== 'FINALIZADA')) continue;
    check(order.status === 'EXPEDICAO', `${tag}: OP deveria estar em EXPEDICAO, está ${order.status}`);
    const sumLoss = order.steps.reduce((a: number, x: any) => a + (x.lossQuantity || 0), 0);
    check(order.totalLosses === sumLoss, `${tag}: total de perdas ${order.totalLosses}, soma das etapas ${sumLoss}`);
    check(order.currentGoodQuantity === expectedReceived, `${tag}: saldo final ${order.currentGoodQuantity}, esperado ${expectedReceived}`);
    check(order.currentGoodQuantity + sumLoss === s.qty, `${tag}: boas + perdas (${order.currentGoodQuantity}+${sumLoss}) ≠ quantidade da OP (${s.qty})`);
    if (order.currentGoodQuantity < s.qty) expectThrow(() => store.dispatchOp(order.id), `${tag}: despacho parcial sem justificativa foi aceito`);
    try {
      store.dispatchOp(order.id, order.currentGoodQuantity < s.qty ? 'Envio parcial: perdas registradas' : undefined);
    } catch (e: any) { check(false, `${tag}: despacho falhou: ${e.message}`); }
    check(order.status === 'FINALIZADA', `${tag}: OP não ficou FINALIZADA após despacho`);
    const audit = store.getAuditLogs().filter((a: any) => a.entityId === order.id || order.steps.some((x: any) => x.id === a.entityId));
    for (const action of ['CRIAR_OP', 'START_OPERACAO', 'EXPEDICAO_FINALIZADA']) {
      check(audit.some((a: any) => a.action === action), `${tag}: auditoria sem registro ${action}`);
    }
    store.logoutMachineOperator();
  }

  const uniq = [...new Set(errors)];
  console.log(`\nRodadas: ${ROUNDS} | verificações: ${checks} | falhas: ${errors.length} (${uniq.length} distintas)`);
  uniq.slice(0, Number(process.env.SHOW || 60)).forEach((e) => console.log('  ✗ ' + e));
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => { console.error('Erro fatal na simulação:', e); process.exit(2); });
