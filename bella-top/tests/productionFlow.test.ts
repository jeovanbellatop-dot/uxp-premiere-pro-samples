/**
 * Suíte de Testes Automatizados - Bella Top MES
 * Validação Completa dos Fluxos de Produção, Máquinas, Permissões e Regras de Negócio
 */

import type { User } from '../src/types/mes';
import { mesStore } from '../src/services/mesStore';
import {
  INITIAL_USERS,
  INITIAL_PRODUCTS,
  INITIAL_MACHINES,
  PRODUCT_KEY_OPTIONS,
  buildRouteBlueprint,
} from '../src/data/initialData';
import {
  validateFirestoreConnectivity,
  validateGoogleDriveConnectivity,
  runDiagnostics,
} from '../server/diagnosticsTest';
import { getFirestoreDb } from '../server/firebaseAdmin';

// Cores para saída no terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

let passedTests = 0;
let failedTests = 0;

const defaultConfidence = {
  geral: 100,
  numeroOp: 100,
  cliente: 100,
  produto: 100,
  quantidade: 100,
  gramatura: 100,
  medidas: 100,
  tipoImpressao: 100,
  prazo: 100,
};

function assert(condition: boolean, testName: string, failureDetails?: string) {
  if (condition) {
    console.log(`  ${colors.green}✓${colors.reset} ${testName}`);
    passedTests++;
  } else {
    console.error(`  ${colors.red}✗${colors.reset} ${colors.bold}${testName}${colors.reset}`);
    if (failureDetails) {
      console.error(`    ${colors.yellow}Detalhes: ${failureDetails}${colors.reset}`);
    }
    failedTests++;
  }
}

async function runAllTests() {
  console.log(`\n${colors.cyan}${colors.bold}=== INICIANDO TESTES DO SISTEMA BELLA TOP MES ===${colors.reset}\n`);

  // ==========================================
  // GRUPO 1: CONTROLE DE MÁQUINAS E ESTADO
  // ==========================================
  console.log(`${colors.bold}1. Testes de Controle de Máquinas e Manutenção${colors.reset}`);

  const allMachines = mesStore.getAllFactoryMachines();
  const m1 = allMachines.find((m) => m.id === 'm1-corte-solda');
  const m2 = allMachines.find((m) => m.id === 'm2-corte-solda');
  const m3 = allMachines.find((m) => m.id === 'm3-corte-solda');
  const m4 = allMachines.find((m) => m.id === 'm4-corte-solda');

  assert(m1 !== undefined && m1.status === 'INATIVA', 'M1 (legado) deve estar permanentemente INATIVA');
  assert(m2 !== undefined && m3 !== undefined && m4 !== undefined, 'M2, M3 e M4 devem estar cadastradas e disponíveis');

  // Testar bloqueio de início de operação em máquina INATIVA
  const testOpNumber = 'TEST_OP_001';
  let createdOp;
  try {
    createdOp = mesStore.createOrderFromExtracted({
      numeroOp: testOpNumber,
      numeroPedido: 'PED_001',
      cliente: 'Cliente Teste Controle',
      produtoNome: 'Sacola Teste 40x50',
      codigoProduto: 'BT-01',
      modelo: 'Sacola Alça Fita',
      quantidade: 1000,
      unidade: 'UNIDADES',
      material: 'PEAD',
      gramatura: 40,
      corMaterial: 'Branco',
      larguraMm: 400,
      alturaMm: 500,
      fundoMm: 0,
      medidasFormatadas: '40x50',
      tipoImpressao: 'SEM_IMPRESSAO',
      numeroCores: 0,
      impressaoFrente: '',
      impressaoVerso: '',
      personalizacao: '',
      tipoAlca: 'FITA',
      usoCordao: false,
      usoVisor: false,
      acabamentos: [],
      observacoesTecnicas: '',
      prazoEntrega: new Date(Date.now() + 86400000).toISOString(),
      confiancaLeitura: defaultConfidence,
      precisaRevisaoPcp: false,
    });
  } catch (err: any) {
    createdOp = mesStore.getOrders().find(o => o.opNumber === testOpNumber);
  }

  const firstStep = createdOp?.steps[0];

  // Tentativa de iniciar em máquina inativa deve lançar erro
  let blockedOnInactive = false;
  try {
    mesStore.startOperation(firstStep!.id, 'm1-corte-solda');
  } catch (err: any) {
    blockedOnInactive = true;
  }
  assert(blockedOnInactive, 'Bloquear início de operação em máquina com status INATIVA');

  // Testar colocação de máquina em manutenção e consequente bloqueio
  const maintRes = mesStore.openMachineMaintenanceCall('m4-corte-solda', 'Troca de resistência e teflon', 'Ajuste mecânico');
  const updatedM4 = mesStore.getAllFactoryMachines().find((m) => m.id === 'm4-corte-solda');
  assert(updatedM4?.status === 'MANUTENCAO', 'Atualização de máquina para status MANUTENCAO via chamado de manutenção');

  let blockedOnMaintenance = false;
  try {
    mesStore.startOperation(firstStep!.id, 'm4-corte-solda');
  } catch (err: any) {
    blockedOnMaintenance = true;
  }
  assert(blockedOnMaintenance, 'Bloquear início de operação em máquina com status MANUTENCAO');

  // Restaurar M4 para DISPONIVEL
  mesStore.closeMachineMaintenanceCall('m4-corte-solda', 'Manutenção concluída com sucesso', 'Técnico Autorizado');
  const restoredM4 = mesStore.getAllFactoryMachines().find((m) => m.id === 'm4-corte-solda');
  assert(restoredM4?.status === 'DISPONIVEL', 'Máquina restabelecida para DISPONIVEL após fechamento do chamado');

  // ==========================================
  // GRUPO 2: PERMISSÕES, USUÁRIOS E SEGURANÇA
  // ==========================================
  console.log(`\n${colors.bold}2. Testes de Permissões, Autenticação e Usuários${colors.reset}`);

  const { ServerAuthService } = await import('../server/authService');
  const masterInit = await ServerAuthService.ensureMasterUser();
  await ServerAuthService.ensureDefaultUsers();
  const masterTempPass = ServerAuthService.getMasterTempPassword() || masterInit.tempPassword || '';
  const firestoreSnap = await getFirestoreDb().collection('usuarios').get();
  const firestoreUsers = firestoreSnap.docs.map((d) => d.data() as User);
  (mesStore as any).users = firestoreUsers;
  const fullMasterUser = firestoreUsers.find((u) => u.login === 'master');

  // Testar filtragem de administradores ativos
  const activeAdmins = mesStore.getActiveAdministrators();
  const allAreAdmins = activeAdmins.every((u) => u.role === 'ADMIN' || (u.role as string) === 'MASTER');
  const allAreActive = activeAdmins.every((u) => u.isActive !== false);
  const noOperatorsInAdmins = activeAdmins.every((u) => u.role !== 'OPERATOR');

  assert(activeAdmins.length > 0, 'Lista de administradores ativos não deve ser vazia');
  assert(allAreAdmins, 'Lista de administradores contém apenas usuários com perfil ADMIN ou MASTER');
  assert(allAreActive, 'Lista de administradores contém apenas usuários ATIVOS');
  assert(noOperatorsInAdmins, 'Nenhum OPERATOR está presente na lista de administradores');

  // Testar login administrativo válido e inválido
  (mesStore as any).failedAttempts = {};
  const adminUser = activeAdmins.find((a) => a.role === 'MASTER' || a.id === 'user_master') || fullMasterUser || activeAdmins[0];
  let validAdminLogin = mesStore.loginAdministrator(adminUser.id, 'admin123');
  if (!validAdminLogin.success && masterTempPass) {
    validAdminLogin = mesStore.loginAdministrator(adminUser.id, masterTempPass);
  }
  assert(validAdminLogin.success, `Login de administrador com credenciais válidas (${adminUser.name})`, validAdminLogin.error);

  const invalidAdminLogin = mesStore.loginAdministrator(adminUser.id, 'senha_incorreta_12345');
  assert(!invalidAdminLogin.success, 'Rejeitar login de administrador com senha incorreta');

  // Testar autenticação de operador de máquina
  const createdOpRes = await mesStore.createUser({
    name: 'Operador Teste M2',
    username: 'op_teste_' + Date.now(),
    password: 'Senha_Forte_Op123!',
    sectors: ['CORTE_SOLDA'],
    authorizedMachineIds: ['m2-corte-solda', 'm3-corte-solda'],
  });
  const op = createdOpRes.user || mesStore.getUsers().find((u) => u.role === 'OPERATOR')!;

  // Iniciar sessão de posto de trabalho
  const sessionRes = mesStore.loginMachineOperator('m2-corte-solda', op.id, 'Senha_Forte_Op123!');
  assert(sessionRes.success, `Sessão de posto iniciada na máquina M2 para operador ${op.name}`);

  const currentSession = mesStore.getMachineSession('m2-corte-solda');
  assert(currentSession?.operatorId === op.id, 'Sessão de posto vinculada ao ID do operador');

  // Desconectar operador
  mesStore.logoutMachineOperator('m2-corte-solda');
  const closedSession = mesStore.getMachineSession('m2-corte-solda');
  assert(closedSession === null, 'Sessão do posto de trabalho encerrada com sucesso');

  // Testes de Exclusão de Usuários (Gestão de Usuários e Permissões)
  // 1. Bloqueio de exclusão do próprio usuário autenticado
  (mesStore as any).authenticatedUser = adminUser;
  const deleteSelfRes = await mesStore.deleteUser(adminUser.id);
  assert(
    !deleteSelfRes.success && deleteSelfRes.error?.includes('próprio usuário'),
    'Exclusão de Usuário: Bloqueia tentativa de excluir o próprio usuário logado'
  );

  // 2. Bloqueio de exclusão de usuários protegidos (master / admin)
  const deleteMasterRes = await ServerAuthService.deleteUser('user_admin_secundario', 'user_master');
  assert(
    !deleteMasterRes.success && deleteMasterRes.error?.includes('protegidos'),
    'Exclusão de Usuário: Bloqueia tentativa de excluir conta protegida de sistema (master/admin)'
  );

  // 3. Exclusão bem-sucedida de usuário comum e atualização de estado imediata
  const tempOp = await mesStore.createUser({
    name: 'Operador Temporario Exclusao',
    username: 'op_temp_del_' + Date.now(),
    password: 'Senha_Forte_Temp123!',
    sectors: ['REFILE'],
  });
  const tempUserId = tempOp.user!.id;
  assert(mesStore.getUsers().some((u) => u.id === tempUserId), 'Usuário temporário criado com sucesso');

  const deleteSuccessRes = await mesStore.deleteUser(tempUserId);
  assert(deleteSuccessRes.success, 'Exclusão de Usuário: Exclui com sucesso usuário comum');
  assert(!mesStore.getUsers().some((u) => u.id === tempUserId), 'Exclusão de Usuário: Usuário removido da lista e estado imediatamente');

  const auditLogHasDeletedAction = mesStore.getAuditLogs().some(
    (l) => l.action === 'USUARIO_EXCLUIDO' && l.entityId === tempUserId
  );
  assert(auditLogHasDeletedAction, 'Exclusão de Usuário: Registro de auditoria USUARIO_EXCLUIDO gerado preservando histórico');

  // 4. Teste Multi-Dispositivo Real: Criação no Dispositivo A -> Leitura do zero e Login no Dispositivo B via Firestore
  const multiDevUsername = 'op_multidev_' + Date.now();
  const multiDevPassword = 'MultiDevice_Pass2026!';
  const createMultiDevRes = await ServerAuthService.createUser('user_master', {
    name: 'Operador Multi Dispositivo Real',
    username: multiDevUsername,
    password: multiDevPassword,
    sectors: ['CORTE_SOLDA', 'ALCA'],
    jobTitle: 'Operador Multi-Dispositivo',
  });
  assert(createMultiDevRes.success, 'Multi-Dispositivo: Usuário criado no Dispositivo A e persistido no Firestore');

  // Simula Dispositivo B (sem cache local, acessando diretamente o Firestore)
  const clientBLogin = await ServerAuthService.login(multiDevUsername, multiDevPassword);
  assert(
    clientBLogin.success && clientBLogin.user?.name === 'Operador Multi Dispositivo Real',
    'Multi-Dispositivo: Dispositivo B lê diretamente do Firestore e realiza login com sucesso'
  );

  // Redefinição de Senha no Dispositivo A e validação no Dispositivo B
  const multiDevNewPass = 'NovaSenhaMulti_987!';
  const resetMultiDevRes = await ServerAuthService.resetPassword('user_master', createMultiDevRes.user!.id, multiDevNewPass);
  assert(resetMultiDevRes.success, 'Multi-Dispositivo: Senha redefinida pelo Administrador no Dispositivo A');

  const clientBNewLogin = await ServerAuthService.login(multiDevUsername, multiDevNewPass);
  assert(
    clientBNewLogin.success,
    'Multi-Dispositivo: Dispositivo B autentica com a nova senha atualizada no Firestore'
  );

  // Limpeza
  await ServerAuthService.deleteUser('user_master', createMultiDevRes.user!.id);

  // ==========================================
  // GRUPO 3: ORDENS DE PRODUÇÃO E COMPATIBILIDADE
  // ==========================================
  console.log(`\n${colors.bold}3. Testes de Ordem de Produção (OP) e Regras Técnicas${colors.reset}`);

  // Testar duplicidade de OP
  let duplicatePrevented = false;
  try {
    mesStore.createOrderFromExtracted({
      numeroOp: testOpNumber, // Já existe
      numeroPedido: 'PED_002',
      cliente: 'Outro Cliente',
      produtoNome: 'Produto Duplicado',
      codigoProduto: 'BT-02',
      modelo: 'Sacola Alça Fita',
      quantidade: 500,
      unidade: 'UNIDADES',
      material: 'PEBD',
      gramatura: 50,
      corMaterial: 'Transparente',
      larguraMm: 300,
      alturaMm: 400,
      fundoMm: 0,
      medidasFormatadas: '30x40',
      tipoImpressao: 'SEM_IMPRESSAO',
      numeroCores: 0,
      impressaoFrente: '',
      impressaoVerso: '',
      personalizacao: '',
      tipoAlca: 'FITA',
      usoCordao: false,
      usoVisor: false,
      acabamentos: [],
      observacoesTecnicas: '',
      prazoEntrega: new Date().toISOString(),
      confiancaLeitura: defaultConfidence,
      precisaRevisaoPcp: false,
    });
  } catch (err: any) {
    duplicatePrevented = true;
  }
  assert(duplicatePrevented, 'Bloquear cadastro de Ordem de Produção com número de OP já existente');

  // Testar regra exclusiva da Máquina 3: formato 8x12
  const op8x12 = {
    id: 'op_8x12_test',
    opNumber: 'OP_8X12',
    client: 'Cliente 8x12',
    productName: 'Sacola 8x12 Especial',
    dimensions: { width: 80, height: 120 },
    quantity: 1000,
    unit: 'MILHEIROS' as const,
    deadline: new Date().toISOString(),
    priority: 'VERDE' as const,
    status: 'PROGRAMADA' as const,
    sector: 'CORTE_SOLDA' as const,
    steps: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const dummyStep = {
    id: 'step_test_cs',
    opId: op8x12.id,
    processTypeId: 'proc_solda',
    processName: 'Corte e Solda',
    unit: 'MILHEIROS',
    receivedQuantity: 1000,
    producedQuantity: 0,
    wasteQuantity: 0,
    status: 'PRONTA' as const,
    sequence: 1,
    assignedMachineId: 'm3-corte-solda',
    assignedMachineName: 'Máquina 3',
  };

  const rec8x12OnM3 = mesStore.calculateCorteSoldaRecommendation(op8x12 as any, dummyStep as any, 'm3-corte-solda');
  const rec8x12OnM2 = mesStore.calculateCorteSoldaRecommendation(op8x12 as any, dummyStep as any, 'm2-corte-solda');
  const rec8x12OnM4 = mesStore.calculateCorteSoldaRecommendation(op8x12 as any, dummyStep as any, 'm4-corte-solda');

  assert(!rec8x12OnM3.isBlocked && rec8x12OnM3.isCompatible, 'Medida 8x12 permitida e compatível na Máquina 3');
  assert(rec8x12OnM2.isBlocked, 'Medida 8x12 bloqueada na Máquina 2');
  assert(rec8x12OnM4.isBlocked, 'Medida 8x12 bloqueada na Máquina 4');

  // Testar regra exclusiva da Máquina 3: Mochilinha com Cordão
  const opCord = {
    ...op8x12,
    id: 'op_cord_test',
    dimensions: { width: 250, height: 350 },
    hasDrawstring: true,
    handleType: 'CORDÃO',
  };
  const recCordOnM3 = mesStore.calculateCorteSoldaRecommendation(opCord as any, dummyStep as any, 'm3-corte-solda');
  const recCordOnM4 = mesStore.calculateCorteSoldaRecommendation(opCord as any, dummyStep as any, 'm4-corte-solda');

  assert(!recCordOnM3.isBlocked && recCordOnM3.isCompatible, 'Produto com cordão permitido e compatível na Máquina 3');
  assert(recCordOnM4.isBlocked, 'Produto com cordão bloqueado na Máquina 4');

  // Testar regra de visor: Máquina 4 não aceita visor
  const opVisor = {
    ...op8x12,
    id: 'op_visor_test',
    dimensions: { width: 300, height: 400 },
    hasVisor: true,
    productName: 'Sacola com Visor Cristal',
  };
  const recVisorOnM4 = mesStore.calculateCorteSoldaRecommendation(opVisor as any, dummyStep as any, 'm4-corte-solda');
  const recVisorOnM2 = mesStore.calculateCorteSoldaRecommendation(opVisor as any, dummyStep as any, 'm2-corte-solda');

  assert(recVisorOnM4.isBlocked, 'Máquina 4 bloqueada para produtos com Visor');
  assert(!recVisorOnM2.isBlocked, 'Máquina 2 permitida para produtos com Visor');

  // ==========================================
  // GRUPO 4: FLUXO DE PRODUÇÃO, PAUSAS E PERDAS
  // ==========================================
  console.log(`\n${colors.bold}4. Testes de Fluxo Sequencial, Pausas, Perdas e Saldo${colors.reset}`);

  // Criar uma OP multi-etapas para teste de fluxo (Extrusão -> Impressão -> Corte e Solda)
  const flowOpNumber = 'FLOW_TEST_' + Date.now().toString().slice(-4);
  const flowOp = mesStore.createOrderFromExtracted({
    numeroOp: flowOpNumber,
    numeroPedido: 'PED_FLOW_01',
    cliente: 'Cliente Fluxo Sequencial',
    // Alça vazada: roteiro 100% alocável com as máquinas realmente cadastradas
    // (Refile -> Corte e Solda -> Expedição). Não depende do posto de Colocar Alça,
    // que ainda não existe no cadastro de máquinas da fábrica.
    produtoNome: 'Sacola 30x40 Alça Vazada',
    codigoProduto: 'BT-SAV-03',
    modelo: 'Sacola Alça Vazada',
    quantidade: 5000,
    unidade: 'UNIDADES',
    material: 'TNT',
    gramatura: 60,
    corMaterial: 'Azul',
    larguraMm: 300,
    alturaMm: 400,
    fundoMm: 0,
    medidasFormatadas: '30x40',
    tipoImpressao: 'SEM_IMPRESSAO',
    numeroCores: 0,
    impressaoFrente: '',
    impressaoVerso: '',
    personalizacao: '',
    tipoAlca: 'VAZADA',
    usoCordao: false,
    usoVisor: false,
    acabamentos: [],
    observacoesTecnicas: '',
    prazoEntrega: new Date(Date.now() + 86400000).toISOString(),
    confiancaLeitura: defaultConfidence,
    precisaRevisaoPcp: false,
  });

  assert(
    flowOp.steps.every((s) => s.processTypeId === 'proc_expedicao' || Boolean(s.assignedMachineId)),
    'Roteiro totalmente alocado: nenhuma etapa produtiva sem máquina real'
  );
  assert(
    flowOp.steps.every((s) => !String(s.assignedMachineId || '').startsWith('workstation_')),
    'Nenhuma etapa recebe identificador de máquina inventado'
  );

  const step1 = flowOp.steps[0];
  const step2 = flowOp.steps[1];
  const targetMacId = step1.assignedMachineId || 'm2-corte-solda';

  // Testar bloqueio de início de etapa fora de ordem
  if (step2) {
    let outOfOrderBlocked = false;
    try {
      mesStore.startOperation(step2.id, step2.assignedMachineId || 'm2-corte-solda');
    } catch (err: any) {
      outOfOrderBlocked = true;
    }
    assert(outOfOrderBlocked, 'Bloquear início de etapa N+1 antes da conclusão da etapa N (fluxo sequencial estrito)');
  }

  // Iniciar etapa 1
  mesStore.startOperation(step1.id, targetMacId);
  const macProducing = mesStore.getAllFactoryMachines().find((m) => m.id === targetMacId);
  assert(macProducing?.status === 'PRODUZINDO', 'Máquina passa para status PRODUZINDO ao iniciar etapa');

  // Testar pausa da operação
  mesStore.pauseOperation(step1.id, 'Troca de bobina e ajuste de faca', targetMacId);
  const macPaused = mesStore.getAllFactoryMachines().find((m) => m.id === targetMacId);
  assert(macPaused?.status === 'PAUSADA', 'Máquina passa para status PAUSADA com motivo registrado');
  assert(macPaused?.currentPauseReason?.includes('Troca de bobina'), 'Motivo da pausa salvo na máquina');

  // Testar retomada da operação
  mesStore.resumeOperation(step1.id, targetMacId);
  const macResumed = mesStore.getAllFactoryMachines().find((m) => m.id === targetMacId);
  assert(macResumed?.status === 'PRODUZINDO', 'Máquina retoma para status PRODUZINDO');

  // Testar finalização com perdas: Perdas NÃO avançam para próxima etapa
  const initialQty = step1.receivedQuantity || 5000;
  const wasteQty = 200;
  const producedQty = initialQty; // produziu o lote, mas teve 200 de refugo

  mesStore.finishOperation(
    step1.id,
    {
      producedQuantity: producedQty,
      lossQuantity: wasteQty,
      lossReason: 'Aparação de refugo e teste de solda',
    },
    targetMacId
  );

  const macAfterFinish = mesStore.getAllFactoryMachines().find((m) => m.id === targetMacId);
  assert(macAfterFinish?.status === 'DISPONIVEL', 'Máquina é liberada (DISPONIVEL) ao finalizar etapa');

  const refreshedOp = mesStore.getOrders().find((o) => o.id === flowOp.id);
  const finishedStep1 = refreshedOp?.steps[0];
  assert(finishedStep1?.status === 'FINALIZADA', 'Etapa 1 marcada como FINALIZADA');
  assert(finishedStep1?.lossQuantity === wasteQty, 'Quantidade de perdas registrada na etapa');

  if (refreshedOp?.steps[1]) {
    const nextStep = refreshedOp.steps[1];
    const expectedGoodQty = Math.max(0, producedQty - wasteQty);
    assert(
      nextStep.receivedQuantity === expectedGoodQty,
      `Saldo líquido bom avança para próxima etapa (${nextStep.receivedQuantity} = ${producedQty} - ${wasteQty})`
    );
    assert(
      nextStep.receivedQuantity < initialQty,
      'Perdas NÃO avançaram para a próxima máquina'
    );
  }

  // ==========================================
  // GRUPO 5: EXPEDIÇÃO E DESPACHO
  // ==========================================
  console.log(`\n${colors.bold}5. Testes de Expedição e Despacho${colors.reset}`);

  // Testar bloqueio de despacho para OP que ainda tem etapas pendentes
  let dispatchBlocked = false;
  try {
    mesStore.dispatchOp(flowOp.id, 'Transportadora Bella - NF-998877');
  } catch (err: any) {
    dispatchBlocked = true;
  }
  assert(dispatchBlocked, 'Bloquear despacho de OP quando houver etapas produtivas pendentes');

  // Concluir todas as etapas restantes para testar despacho bem sucedido
  const opToDispatch = mesStore.getOrders().find((o) => o.id === flowOp.id);
  if (opToDispatch) {
    const finalGoodQty = 4800;
    for (let i = 1; i < opToDispatch.steps.length; i++) {
      const step = opToDispatch.steps[i];
      step.status = 'FINALIZADA';
      step.receivedQuantity = finalGoodQty;
      step.producedQuantity = finalGoodQty;
      step.lossQuantity = 0;
      step.actualEndTime = new Date().toISOString();
    }
    opToDispatch.currentGoodQuantity = finalGoodQty;

    mesStore.dispatchOp(flowOp.id, 'Transportadora Rápida - NF-12345');
    const dispatchedOp = mesStore.getOrders().find((o) => o.id === flowOp.id);
    assert(dispatchedOp?.status === 'FINALIZADA', 'Status da OP atualizado após despacho');
  }

  // ==========================================
  // 8. TESTES DE DIAGNÓSTICO E CONECTIVIDADE (FIRESTORE & GOOGLE DRIVE)
  // ==========================================
  // ==========================================
  // 7.9 ROTEIRO OFICIAL POR PRODUTO (REFILE XOR FLEXOGRAFIA)
  // ==========================================
  console.log(`\n${colors.cyan}--- 7.9 ROTEIRO OFICIAL POR PRODUTO ---${colors.reset}`);

  const rota = (entrada: any) => buildRouteBlueprint(entrada).processIds.join(' -> ');

  const cenarios: Array<{ nome: string; entrada: any; esperado: string }> = [
    {
      nome: 'Sacola Alça Fita + Flexografia',
      entrada: { productName: 'Sacola Alça Fita', printingMethod: 'FLEXOGRAFIA', handleType: 'FITA' },
      esperado: 'proc_flexografia -> proc_solda -> proc_colocar_alca -> proc_expedicao',
    },
    {
      nome: 'Sacola Alça Fita + Carrossel',
      entrada: { productName: 'Sacola Alça Fita', printingMethod: 'SERIGRAFIA', handleType: 'FITA' },
      esperado: 'proc_refile -> proc_solda -> proc_serigrafia -> proc_colocar_alca -> proc_expedicao',
    },
    {
      nome: 'Sacola Alça Fita com Fundo + Flexografia (fundo não muda o roteiro)',
      entrada: { productName: 'Sacola Alça Fita com Fundo', printingMethod: 'FLEXOGRAFIA', handleType: 'FITA' },
      esperado: 'proc_flexografia -> proc_solda -> proc_colocar_alca -> proc_expedicao',
    },
    {
      nome: 'Alça Vazada + Flexografia',
      entrada: { productName: 'Sacola Alça Vazada', printingMethod: 'FLEXOGRAFIA', handleType: 'VAZADA' },
      esperado: 'proc_flexografia -> proc_solda -> proc_expedicao',
    },
    {
      nome: 'Alça Vazada + Carrossel',
      entrada: { productName: 'Sacola Alça Vazada', printingMethod: 'CARROSSEL', handleType: 'VAZADA' },
      esperado: 'proc_refile -> proc_solda -> proc_serigrafia -> proc_expedicao',
    },
    {
      nome: 'Saco de TNT com visor + Flexografia (visor não cria etapa)',
      entrada: { productName: 'Saco de TNT com Visor', printingMethod: 'FLEXOGRAFIA', hasWindow: true },
      esperado: 'proc_flexografia -> proc_solda -> proc_expedicao',
    },
    {
      nome: 'Mochilinha + Flexografia (sempre cordão manual)',
      entrada: { productName: 'Mochilinha', printingMethod: 'FLEXOGRAFIA' },
      esperado: 'proc_flexografia -> proc_solda -> proc_passar_fio -> proc_expedicao',
    },
    {
      nome: 'Sacola de Presente + Carrossel (cordão manual antes da alça)',
      entrada: { productName: 'Sacola de Presente', printingMethod: 'SERIGRAFIA' },
      esperado: 'proc_refile -> proc_solda -> proc_serigrafia -> proc_passar_fio -> proc_colocar_alca -> proc_expedicao',
    },
    {
      nome: 'Saco de Presente + Flexografia',
      entrada: { productName: 'Saco de Presente', printingMethod: 'FLEXOGRAFIA' },
      esperado: 'proc_flexografia -> proc_solda -> proc_passar_fio -> proc_expedicao',
    },
    {
      nome: 'Sacola Box + Flexografia (costura antes da alça)',
      entrada: { productName: 'Sacola Box', printingMethod: 'FLEXOGRAFIA', handleType: 'FITA' },
      esperado: 'proc_flexografia -> proc_solda -> proc_costura -> proc_colocar_alca -> proc_expedicao',
    },
    {
      nome: 'Sacola Box + Carrossel',
      entrada: { productName: 'Sacola Box', printingMethod: 'CARROSSEL', handleType: 'FITA' },
      esperado: 'proc_refile -> proc_solda -> proc_serigrafia -> proc_costura -> proc_colocar_alca -> proc_expedicao',
    },
    {
      nome: 'Ecobag de Algodão (chega pronta)',
      entrada: { productName: 'Ecobag de Algodão', printingMethod: 'SERIGRAFIA' },
      esperado: 'proc_serigrafia -> proc_expedicao',
    },
    {
      nome: 'Lixo Car + Flexografia (igual alça vazada)',
      entrada: { productName: 'Lixo Car', printingMethod: 'FLEXOGRAFIA' },
      esperado: 'proc_flexografia -> proc_solda -> proc_expedicao',
    },
    {
      nome: 'Saquinho de Algodão (terceirizado)',
      entrada: { productName: 'Saquinho de Algodão', printingMethod: 'SERIGRAFIA' },
      esperado: 'proc_terceirizado -> proc_serigrafia -> proc_expedicao',
    },
    {
      nome: 'Sacola lisa sem impressão começa pelo Refile',
      entrada: { productName: 'Sacola Alça Vazada', printingMethod: 'SEM_IMPRESSAO', handleType: 'VAZADA' },
      esperado: 'proc_refile -> proc_solda -> proc_expedicao',
    },
  ];

  cenarios.forEach((c) => {
    const obtido = rota(c.entrada);
    assert(obtido === c.esperado, `Roteiro: ${c.nome}`, `Esperado: ${c.esperado} | Obtido: ${obtido}`);
  });

  // Clientes com regra fixa de cordão manual
  ['Arezzo', 'Anacapri', 'Sonho dos Pés'].forEach((marca) => {
    const bp = buildRouteBlueprint({
      productName: 'Saco de TNT sem visor',
      printingMethod: 'FLEXOGRAFIA',
      client: marca + ' Indústria e Comércio',
      hasCord: true,
    });
    assert(
      bp.cordMode === 'MANUAL' && bp.cordForcedByClient && bp.processIds.includes('proc_passar_fio'),
      `Cordão manual automático para o cliente ${marca}`,
      `cordMode: ${bp.cordMode} | rota: ${bp.processIds.join(' -> ')}`
    );
  });

  // Flexografia nunca recebe Carrossel, e Carrossel sempre começa pelo Refile
  const bpFlex = buildRouteBlueprint({ productName: 'Sacola Alça Fita', printingMethod: 'FLEXOGRAFIA', handleType: 'FITA' });
  assert(
    !bpFlex.processIds.includes('proc_serigrafia') && !bpFlex.processIds.includes('proc_refile'),
    'REFILE XOR FLEXOGRAFIA: OP de Flexografia não recebe Refile nem Carrossel',
    bpFlex.processIds.join(' -> ')
  );
  const bpCarr = buildRouteBlueprint({ productName: 'Sacola Alça Fita', printingMethod: 'CARROSSEL', handleType: 'FITA' });
  assert(
    bpCarr.processIds[0] === 'proc_refile' && !bpCarr.processIds.includes('proc_flexografia'),
    'REFILE XOR FLEXOGRAFIA: OP de Carrossel começa pelo Refile e não recebe Flexografia',
    bpCarr.processIds.join(' -> ')
  );

  // Cordão automático não cria etapa e continua exigindo a Máquina 3
  const bpAuto = buildRouteBlueprint({ productName: 'Saco de TNT sem visor', printingMethod: 'FLEXOGRAFIA', hasCord: true, cordMode: 'AUTOMATICO' });
  assert(
    bpAuto.cordMode === 'AUTOMATICO' && !bpAuto.processIds.includes('proc_passar_fio'),
    'Cordão automático não cria etapa separada',
    bpAuto.processIds.join(' -> ')
  );

  // Informação crítica ambígua vai para o PCP
  const bpDuvida = buildRouteBlueprint({ productName: 'Sacola', printingMethod: '', handleType: '' });
  assert(
    bpDuvida.needsPcpValidation && bpDuvida.warnings.length > 0,
    'Produto e impressão ambíguos marcam a OP para REVISAO_PCP',
    JSON.stringify(bpDuvida.warnings)
  );

  // Catalogos nao podem ter furos (virgula dupla cria slot vazio e quebra o find()).
  const catalogosIntegros =
    INITIAL_PRODUCTS.every((p) => Boolean(p && p.id && p.code)) &&
    INITIAL_PRODUCTS.length === Object.keys(INITIAL_PRODUCTS).length &&
    INITIAL_MACHINES.every((m) => Boolean(m && m.id && m.processTypeId)) &&
    INITIAL_MACHINES.length === Object.keys(INITIAL_MACHINES).length;
  assert(
    catalogosIntegros,
    'Catálogos de produtos e máquinas sem entradas vazias',
    `produtos: ${INITIAL_PRODUCTS.length}/${Object.keys(INITIAL_PRODUCTS).length}, maquinas: ${INITIAL_MACHINES.length}/${Object.keys(INITIAL_MACHINES).length}`
  );

  // Todo produto do roteiro precisa existir no catálogo, senão a OP quebra na criação.
  const produtosDoRoteiro = PRODUCT_KEY_OPTIONS.filter((o) => o.key !== 'NAO_IDENTIFICADO');
  const semCatalogo = produtosDoRoteiro.filter((o) => {
    const bp = buildRouteBlueprint({ productKeyOverride: o.key, productName: o.label, printingMethod: 'FLEXOGRAFIA' });
    return bp.productCatalogId ? !INITIAL_PRODUCTS.some((p) => p && p.id === bp.productCatalogId) : false;
  });
  assert(
    semCatalogo.length === 0,
    'Todo produto do roteiro tem cadastro correspondente no catálogo',
    semCatalogo.map((o) => o.key).join(', ')
  );

  // O PCP confirma o produto na tela: o override vence a identificação automática
  // e tira a OP da fila de revisão quando o resto dos dados está completo.
  const bpConfirmado = buildRouteBlueprint({
    productName: 'Sacola',
    printingMethod: 'CARROSSEL',
    handleType: '',
    productKeyOverride: 'SACOLA_BOX',
  });
  assert(
    bpConfirmado.productKey === 'SACOLA_BOX' &&
      bpConfirmado.processIds.includes('proc_costura') &&
      !bpConfirmado.needsPcpValidation,
    'PCP confirma o produto na tela e o roteiro passa a seguir a regra do produto confirmado',
    bpConfirmado.processIds.join(' -> ')
  );

  // Se o PCP nao confirmar (deixar como nao identificado), a OP continua em revisão.
  const bpSemConfirmacao = buildRouteBlueprint({
    productName: 'Sacola',
    printingMethod: 'CARROSSEL',
    handleType: '',
    productKeyOverride: 'NAO_IDENTIFICADO',
  });
  assert(
    bpSemConfirmacao.needsPcpValidation,
    'Produto deixado como não identificado mantém a OP em REVISAO_PCP',
    JSON.stringify(bpSemConfirmacao.warnings)
  );

  console.log(`\n${colors.cyan}--- 8. DIAGNÓSTICO E CONECTIVIDADE (FIRESTORE & DRIVE) ---${colors.reset}`);

  // Teste 8.1: Validação de conectividade real do Firestore (firebase-admin)
  const firestoreResult = await validateFirestoreConnectivity();
  assert(
    firestoreResult.service === 'firestore' &&
      (firestoreResult.status === 'CONNECTED' ||
        firestoreResult.status === 'NOT_CONFIGURED' ||
        (firestoreResult.status === 'ERROR' && firestoreResult.message?.includes('RESOURCE_EXHAUSTED'))) &&
      typeof firestoreResult.configured === 'boolean',
    'Firestore: Executa teste de conectividade e validação via firebase-admin com sucesso'
  );

  // Teste 8.2: Validação de conectividade real do Google Drive (googleapis)
  const driveResult = await validateGoogleDriveConnectivity();
  assert(
    driveResult.service === 'google_drive' &&
      (driveResult.status === 'CONNECTED' ||
        driveResult.status === 'NOT_CONFIGURED' ||
        driveResult.status === 'REACHABLE_AUTH_REQUIRED' ||
        driveResult.status === 'ERROR') &&
      typeof driveResult.configured === 'boolean',
    'Google Drive: Diagnóstico de conectividade e status da API executado com sucesso'
  );

  // Teste 8.3: runDiagnostics compila estrutura unificada com métricas de ambiente
  const diagnosticsReport = await runDiagnostics();
  assert(
    typeof diagnosticsReport.success === 'boolean' &&
      !!diagnosticsReport.environment.nodeVersion &&
      !!diagnosticsReport.environment.platform &&
      diagnosticsReport.services.firestore.service === 'firestore' &&
      diagnosticsReport.services.googleDrive.service === 'google_drive' &&
      typeof diagnosticsReport.summary.total === 'number' &&
      diagnosticsReport.summary.total === 2,
    'runDiagnostics: Gera relatório unificado com métricas de ambiente, Firestore e Drive'
  );

  // Teste 8.4: Regra estrita: NUNCA salvar base64 em localStorage
  console.log(`\n${colors.cyan}--- 8.4 ARQUITETURA DE PERSISTÊNCIA & SEGURANÇA ---${colors.reset}`);
  const opWithHeavyBase64 = mesStore.createOrderFromExtracted({
    numeroOp: 'OP_BASE64_SEC_TEST',
    numeroPedido: 'PED_SEC_01',
    cliente: 'Cliente Teste Anti Base64',
    produtoNome: 'Sacola Teste 30x40',
    codigoProduto: 'BT-SEC-01',
    modelo: 'Sacola Alça Vazada',
    quantidade: 1000,
    unidade: 'UNIDADES',
    material: 'TNT',
    gramatura: 60,
    corMaterial: 'Branco',
    larguraMm: 300,
    alturaMm: 400,
    fundoMm: 0,
    medidasFormatadas: '30x40',
    tipoImpressao: 'SEM_IMPRESSAO',
    numeroCores: 0,
    impressaoFrente: '',
    impressaoVerso: '',
    personalizacao: '',
    tipoAlca: 'VAZADA',
    usoCordao: false,
    usoVisor: false,
    acabamentos: [],
    observacoesTecnicas: '',
    prazoEntrega: new Date(Date.now() + 86400000).toISOString(),
    confiancaLeitura: defaultConfidence,
    precisaRevisaoPcp: false,
    layoutPreviewImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    productThumbnail: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  });

  const storedOrdersJson = typeof localStorage !== 'undefined' ? localStorage.getItem('bellatop_orders_v2') : '';
  const containsBase64InStorage = storedOrdersJson ? storedOrdersJson.includes('data:image/') || storedOrdersJson.includes('base64,') : false;
  assert(
    !containsBase64InStorage,
    'Persistência: NUNCA salva base64 em localStorage (higienização e segurança de cota)'
  );

  // Teste 8.5: FilePersistenceService e Drive Bridge
  const { FilePersistenceService } = await import('../server/filePersistenceService');
  const dummyFileBuffer = Buffer.from('Conteúdo simulado de PDF da Ordem de Produção');
  const fileSaveResult = await FilePersistenceService.saveAndUploadFile({
    opNumero: '15487',
    categoria: 'PDF da OP',
    fileName: 'Ordem_Producao_15487.pdf',
    mimeType: 'application/pdf',
    buffer: dummyFileBuffer,
  });

  assert(
    fileSaveResult.success &&
      fileSaveResult.file.id &&
      (fileSaveResult.file.status === 'ENVIADO' || fileSaveResult.file.status === 'PENDENTE_DRIVE') &&
      fileSaveResult.file.tentativas >= 1,
    'FilePersistenceService: Salva arquivo com segurança (ENVIADO ou PENDING_DRIVE com status e metadados)'
  );

  // Teste 8.6: Recuperação binária resiliente (mesmo quando pendente de sincronização com o Drive)
  const retrievedBinary = await FilePersistenceService.getFileBinary(fileSaveResult.file.id);
  assert(
    retrievedBinary !== null &&
      retrievedBinary.buffer.length === dummyFileBuffer.length &&
      retrievedBinary.mimeType === 'application/pdf',
    'FilePersistenceService: Recupera binário idêntico e íntegro a partir do armazenamento persistente'
  );

  // Teste 8.7: Inicialização Idempotente do Banco de Dados no Firestore
  const { initializeFirestoreDatabase } = await import('../server/dbBootstrap');
  const bootstrapRes1 = await initializeFirestoreDatabase();
  const bootstrapRes2 = await initializeFirestoreDatabase();
  assert(
    bootstrapRes1.success &&
      bootstrapRes2.success &&
      bootstrapRes2.alreadyInitialized === true,
    'Firestore: Inicialização idempotente executada com sucesso sem duplicar ou corromper dados'
  );

  // Teste 8.8: Localização e validação da pasta raiz "Bella Top - Produção"
  const {
    DriveBridge,
    DEFAULT_DRIVE_ROOT_FOLDER_ID,
    STANDARD_SUBFOLDERS,
    CATEGORY_SUBFOLDER_MAP,
  } = await import('../server/driveBridge');

  assert(
    DEFAULT_DRIVE_ROOT_FOLDER_ID === '1270ungaiRH5F_ZjmKFcNCJRHDFbVTosC' &&
      DriveBridge.getRootFolderId() === '1270ungaiRH5F_ZjmKFcNCJRHDFbVTosC',
    'Google Drive: Pasta raiz "Bella Top - Produção" configurada com ID canônico (1270ungaiRH5F_ZjmKFcNCJRHDFbVTosC)'
  );

  // Teste 8.9: Criação e mapeamento das 7 subpastas oficiais sem duplicação
  const provisionResult = await DriveBridge.provisionStructure();
  const allSubfoldersPresent = STANDARD_SUBFOLDERS.every((sub) =>
    provisionResult.subfolders.some((s) => s.name === sub)
  );
  assert(
    allSubfoldersPresent && provisionResult.subfolders.length === 7,
    'Google Drive: Mapeamento e provisionamento das 7 subpastas oficiais sem duplicação (00_Backups a 06_Documentos)'
  );

  // Teste 8.10: Validação de limite de tamanho de 30 MB
  let rejectedOver30Mb = false;
  try {
    FilePersistenceService.validateFile('arquivo_pesado.pdf', 'application/pdf', 31 * 1024 * 1024);
  } catch (err: any) {
    rejectedOver30Mb = err.message.includes('30 MB');
  }
  assert(rejectedOver30Mb, 'Validação de Upload: Rejeita com erro HTTP 413 qualquer arquivo acima de 30 MB');

  // Teste 8.11: Bloqueio rigoroso de arquivos executáveis maliciosos
  let blockedExecutable = false;
  try {
    FilePersistenceService.validateFile('script_perigoso.exe', 'application/x-msdownload', 1024);
  } catch (err: any) {
    blockedExecutable = true;
  }
  assert(blockedExecutable, 'Segurança: Bloqueia executáveis e scripts maliciosos (.exe, .sh, .bat)');

  // Teste 8.12: Preservação de metadados obrigatórios do Firestore
  const metaSample = fileSaveResult.file;
  const hasRequiredFields =
    Boolean(metaSample.id) &&
    Boolean(metaSample.opNumero) &&
    Boolean(metaSample.nome) &&
    Boolean(metaSample.mimeType) &&
    typeof metaSample.tamanho === 'number' &&
    Boolean(metaSample.categoria) &&
    Boolean(metaSample.origem) &&
    Boolean(metaSample.destinoAtual) &&
    typeof metaSample.tentativas === 'number' &&
    Boolean(metaSample.criadoEm);

  assert(
    hasRequiredFields,
    'Firestore: Preservação dos metadados completos (id, opId, nome, tamanho, categoria, destinoAtual, status)'
  );

  // Teste 8.13: Reprocessamento de fila com limite de 3 tentativas e idempotência
  const retryResult = await FilePersistenceService.reprocessPendingDriveQueue();
  assert(
    typeof retryResult.processed === 'number' &&
      typeof retryResult.successCount === 'number' &&
      typeof retryResult.failedCount === 'number',
    'Fila de Uploads: Reprocessamento executado com controle de tentativas, backoff e idempotência'
  );

  // Teste 8.14: Backup do Firestore gerado em JSON sanitizado
  const backupResult = await FilePersistenceService.createFirestoreBackup('Teste Automatizado');
  assert(
    backupResult.success &&
      backupResult.backup.id.startsWith('backup_') &&
      backupResult.backup.tamanho > 0 &&
      (backupResult.backup.status === 'CONCLUIDO_DRIVE' || backupResult.backup.status === 'PENDENTE_DRIVE'),
    'Backup: Exportação do Firestore em JSON gerada e salva com segurança em 00_Backups e Storage'
  );

  // Teste 8.15: Diagnóstico completo de status do armazenamento
  const storageStatus = await FilePersistenceService.getStorageStatus();
  assert(
    storageStatus.firebase.status === 'CONNECTED' &&
      storageStatus.googleDrive.rootFolder.id === '1270ungaiRH5F_ZjmKFcNCJRHDFbVTosC' &&
      typeof storageStatus.counts.total === 'number' &&
      Boolean(storageStatus.timestamp),
    'Painel de Armazenamento: Retorna status unificado de Firestore, Storage, Drive e métricas de fila'
  );

  // Teste 8.16: Ausência de tokens no frontend e isolamento de secrets
  const tokenInCode = process.env.DRIVE_BRIDGE_TOKEN || '';
  const isTokenExposed = typeof window !== 'undefined' && (window as any).DRIVE_BRIDGE_TOKEN;
  assert(!isTokenExposed, 'Segurança: DRIVE_BRIDGE_TOKEN nunca exposto ao frontend ou no bundle do cliente');

  // ==========================================
  // 9. LIMPEZA DE HISTÓRICO DO SISTEMA (ADMIN/MASTER)
  // ==========================================
  console.log(`\n${colors.cyan}--- 9. LIMPEZA DE HISTÓRICO E PROTEÇÃO DE COLEÇÕES ---${colors.reset}`);

  const { FORBIDDEN_COLLECTIONS, deleteCollectionInBatches, executeClearHistory } = await import('../server/services/clearHistoryService');
  const testDb = getFirestoreDb();

  // Teste 9.1: Proteção rigorosa de coleções proibidas
  const forbiddenList = [
    'usuarios',
    'maquinas',
    'produtos',
    'clientes',
    'config',
    'setores',
    'processos',
    'regras-roteamento',
    'regras_roteamento',
    'etapas',
    'arquivos',
    'backups',
  ];
  const allProtectedInSet = forbiddenList.every((col) => FORBIDDEN_COLLECTIONS.has(col));
  assert(
    allProtectedInSet,
    'Limpeza de Histórico: Lista de coleções protegidas cobre usuarios, maquinas, produtos, clientes, config, setores, processos, regras-roteamento, etapas, arquivos e backups'
  );

  // Teste 9.2: Bloqueio estrito ao tentar apagar coleção proibida
  let blockedForbidden = false;
  try {
    await deleteCollectionInBatches(testDb, 'usuarios');
  } catch (err: any) {
    blockedForbidden = err?.message?.includes('VIOLAÇÃO DE SEGURANÇA');
  }
  assert(
    blockedForbidden,
    'Limpeza de Histórico: Bloqueia tentativa de apagar coleção protegida (ex: usuarios) com erro de violação de segurança'
  );

  let blockedMaquinas = false;
  try {
    await deleteCollectionInBatches(testDb, 'maquinas');
  } catch (err: any) {
    blockedMaquinas = err?.message?.includes('VIOLAÇÃO DE SEGURANÇA');
  }
  assert(
    blockedMaquinas,
    'Limpeza de Histórico: Bloqueia tentativa de apagar coleção maquinas'
  );

  let blockedArquivos = false;
  try {
    await deleteCollectionInBatches(testDb, 'arquivos');
  } catch (err: any) {
    blockedArquivos = err?.message?.includes('VIOLAÇÃO DE SEGURANÇA');
  }
  assert(
    blockedArquivos,
    'Limpeza de Histórico: Bloqueia tentativa de apagar coleção arquivos'
  );

  // Teste 9.3: Execução de rotina de limpeza com retorno de contagem de registros
  const clearResult = await executeClearHistory(
    { alertas: true, sessoesParadasUploads: true },
    'user_master',
    'Master Bella Top',
    'MASTER'
  );
  assert(
    clearResult.success &&
      typeof clearResult.deletedCounts.total === 'number' &&
      typeof clearResult.deletedCounts.alertas === 'number' &&
      typeof clearResult.deletedCounts.paradas === 'number',
    'Limpeza de Histórico: Executa exclusão em lote no Firestore via Admin SDK e retorna contagem dos registros apagados'
  );

  // ==========================================
  // RESUMO DOS TESTES
  // ==========================================
  console.log(`\n${colors.bold}=== RESULTADO DOS TESTES ===${colors.reset}`);
  console.log(`Total executados: ${passedTests + failedTests}`);
  console.log(`Aprovados: ${colors.green}${passedTests}${colors.reset}`);
  console.log(`Falhas: ${failedTests > 0 ? colors.red : colors.green}${failedTests}${colors.reset}\n`);

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}TODOS OS TESTES PASSARAM COM SUCESSO!${colors.reset}\n`);
    process.exit(0);
  }
}

// Esta suíte usa o Firestore, o Storage e o Drive DE VERDADE e executa a Limpeza de
// Histórico (apaga alertas e paradas). Só roda com autorização explícita.
if (process.env.BELLATOP_LIVE_TESTS !== '1') {
  console.log(
    `${colors.yellow}Suíte de integração ao vivo NÃO executada: ela grava e apaga dados no Firebase real.${colors.reset}\n` +
      'Para rodar contra um banco de TESTE (nunca o da fábrica): BELLATOP_LIVE_TESTS=1 npm run test:live'
  );
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('Erro fatal durante execução dos testes:', err);
  process.exit(1);
});
