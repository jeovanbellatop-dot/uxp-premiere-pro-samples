/**
 * Suíte de Testes de Regressão Automatizados - Bella Top MES
 * Validação rigorosa dos 8 cenários de concorrência, sessões compartilhadas e sincronização.
 * AMBIENTE ISOLADO COM MOCKS IN-MEMORY - SEM NENHUM ACESSO OU GRAVAÇÃO REAL NO FIREBASE.
 */

import './offlineFirebaseKey';
import crypto from 'crypto';
import { createRequire } from 'module';

// =========================================================================
// MOCK DO FIRESTORE EM MEMÓRIA (ANTES DE QUALQUER IMPORT DO BACKEND)
// =========================================================================
const req = createRequire(process.cwd() + '/package.json');
const firestoreCjs = req('firebase-admin/firestore');

const inMemoryStore = new Map<string, any>();

function getDocKey(col: string, id: string): string {
  return `${col}/${id}`;
}

const mockDb: any = {
  collection: (colName: string) => ({
    doc: (docId: string) => {
      const key = getDocKey(colName, docId);
      return {
        id: docId,
        ref: { id: docId, path: key },
        get: async () => {
          const data = inMemoryStore.get(key);
          return {
            exists: Boolean(data),
            id: docId,
            data: () => data,
          };
        },
        set: async (data: any) => {
          inMemoryStore.set(key, { ...data, id: docId });
        },
        update: async (patch: any) => {
          const current = inMemoryStore.get(key) || {};
          inMemoryStore.set(key, { ...current, ...patch });
        },
        delete: async () => {
          inMemoryStore.delete(key);
        },
        collection: (subCol: string) => ({
          get: async () => {
            const prefix = `${key}/${subCol}/`;
            const docs: any[] = [];
            for (const [k, v] of inMemoryStore.entries()) {
              if (k.startsWith(prefix)) {
                docs.push({ id: v.id, data: () => v, ref: { id: v.id, path: k } });
              }
            }
            return { docs, size: docs.length };
          },
          orderBy: () => ({
            get: async () => {
              const prefix = `${key}/${subCol}/`;
              const docs: any[] = [];
              for (const [k, v] of inMemoryStore.entries()) {
                if (k.startsWith(prefix)) {
                  docs.push({ id: v.id, data: () => v, ref: { id: v.id, path: k } });
                }
              }
              return { docs, size: docs.length };
            },
          }),
          doc: (subId: string) => {
            const subKey = `${key}/${subCol}/${subId}`;
            return {
              id: subId,
              get: async () => ({
                exists: inMemoryStore.has(subKey),
                id: subId,
                data: () => inMemoryStore.get(subKey),
              }),
              set: async (data: any) => {
                inMemoryStore.set(subKey, { ...data, id: subId });
              },
              delete: async () => {
                inMemoryStore.delete(subKey);
              },
            };
          },
        }),
      };
    },
    get: async () => {
      const prefix = `${colName}/`;
      const docs: any[] = [];
      for (const [k, v] of inMemoryStore.entries()) {
        if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
          docs.push({ id: v.id, data: () => v });
        }
      }
      return { docs, size: docs.length };
    },
  }),
  runTransaction: async (updateFunction: any) => {
    const tx = {
      get: async (refOrQuery: any) => {
        if (typeof refOrQuery.get === 'function') {
          return refOrQuery.get();
        }
        return { exists: false, data: () => undefined };
      },
      set: (docRef: any, data: any) => {
        inMemoryStore.set(docRef.path || `ops/${docRef.id}`, data);
      },
      update: (docRef: any, data: any) => {
        const key = docRef.path || `ops/${docRef.id}`;
        const current = inMemoryStore.get(key) || {};
        inMemoryStore.set(key, { ...current, ...data });
      },
      delete: (docRef: any) => {
        inMemoryStore.delete(docRef.path || `ops/${docRef.id}`);
      },
    };
    return updateFunction(tx);
  },
};

// Injeta o mock em memória antes da inicialização do Firebase Admin
firestoreCjs.getFirestore = () => mockDb;

// =========================================================================
// MOCK DE LOCALSTORAGE
// =========================================================================
class MockLocalStorage {
  private store: Map<string, string> = new Map();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m',
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ${colors.green}✓${colors.reset} ${testName}`);
    passed++;
  } else {
    console.error(`  ${colors.red}✗${colors.reset} ${colors.bold}${testName}${colors.reset}`);
    if (detail) console.error(`    ${colors.yellow}Detalhe: ${detail}${colors.reset}`);
    failed++;
  }
}

async function runRegressionSuite() {
  console.log(`\n${colors.cyan}${colors.bold}=== INICIANDO SUÍTE DE REGRESSÃO RIGOROSA (ISOLAMENTO COMPLETO) ===${colors.reset}\n`);

  const mockStorage = new MockLocalStorage();
  (global as any).localStorage = mockStorage;

  // Importa serviços após a configuração dos mocks
  const { mesStore } = await import('../src/services/mesStore');
  const { opsRepository } = await import('../server/repositories/opsRepository');
  const { ServerAuthService } = await import('../server/authService');

  const store = mesStore as any;

  // =========================================================================
  // CENÁRIO 1: loginMachineOperator inicia polling e logout zera/revoga sessão
  // =========================================================================
  console.log(`${colors.bold}1. loginMachineOperator inicia polling e logoutMachineOperator limpa estados${colors.reset}`);
  {
    const testOpUser = {
      id: 'user_op_teste_corte',
      name: 'Toninho Santos',
      login: 'toninho',
      role: 'OPERATOR',
      sectors: ['CORTE_SOLDA'],
      authorizedMachineIds: ['m2-corte-solda'],
      isActive: true,
      passwordSalt: 'salt_123',
      passwordHash: crypto.scryptSync('123456', 'salt_123', 64).toString('hex'),
    };
    store.users = [testOpUser];

    // Realiza login no posto
    const loginRes = mesStore.loginMachineOperator('m2-corte-solda', testOpUser.id, '123456');
    assert(loginRes.success, 'loginMachineOperator realiza login com credenciais válidas');
    assert(store.syncIntervalTimer !== null, 'loginMachineOperator ativa polling de sincronização (startSharedDataSync)');
    assert(store.authenticatedUser?.id === testOpUser.id, 'authenticatedUser definido com sucesso');
    assert(store.currentUser?.id === testOpUser.id, 'currentUser definido com sucesso');
    assert(Boolean(store.authSessionToken), 'Token de sessão emitido');

    // Desconecta operador
    mesStore.logoutMachineOperator('m2-corte-solda');
    assert(store.machineSessions['m2-corte-solda'] === undefined, 'Sessão da máquina limpa');
    assert(store.currentUser === null, 'currentUser zerado para null após logout');
    assert(store.authenticatedUser === null, 'authenticatedUser zerado para null após logout');
    assert(store.authSessionToken === null, 'authSessionToken zerado para null após logout');
  }

  // =========================================================================
  // CENÁRIO 2: Token real é restaurado após recarga da página (via new Construtor)
  // =========================================================================
  console.log(`\n${colors.bold}2. Preservação de token legítimo bt_sess_<48hex>_<ts> após recarga (construtor)${colors.reset}`);
  {
    const legitimateToken = `bt_sess_${crypto.randomBytes(24).toString('hex')}_${Date.now()}`;
    const testUser = {
      id: 'user_operador_preservado',
      name: 'Operador Preservado',
      login: 'op_preservado',
      role: 'OPERATOR',
      isActive: true,
      sectors: ['REFILE'],
      authorizedMachineIds: ['*'],
    };

    // Salva usuário em bellatop_users_v4 e sessão legítima no localStorage
    mockStorage.setItem('bellatop_users_v4', JSON.stringify([testUser]));
    mockStorage.setItem('bellatop_auth_session_v3', JSON.stringify({
      token: legitimateToken,
      userId: testUser.id,
      user: testUser,
      loginTime: new Date().toISOString(),
    }));

    // Simula recarga REAL instanciando um novo MesStore via construtor
    const reloadedStore = new (mesStore.constructor as any)();

    assert(
      reloadedStore.authSessionToken === legitimateToken,
      'Construtor preserva token legítimo emitido pelo servidor após recarga',
      `Esperado: ${legitimateToken}, Obtido: ${reloadedStore.authSessionToken}`
    );
    assert(reloadedStore.authenticatedUser?.id === testUser.id, 'Usuário autenticado mantido após recarga');
    assert(reloadedStore.currentUser?.id === testUser.id, 'currentUser mantido após recarga');
  }

  // =========================================================================
  // CENÁRIO 3: Token fictício é descartado e não autentica no navegador (via new Construtor)
  // =========================================================================
  console.log(`\n${colors.bold}3. Rejeição estrita de tokens fictícios no construtor e no navegador${colors.reset}`);
  {
    const fakeTokens = [
      'bt_op_1790000000_fake',
      'bt_sess_incompleto_curto',
      'token_aleatorio_invalido',
      'bt_local_offline_bypass',
    ];

    const testUser = {
      id: 'user_fake_test',
      login: 'fake',
      isActive: true,
      passwordHash: 'hash',
      passwordSalt: 'salt',
    };
    mockStorage.setItem('bellatop_users_v4', JSON.stringify([testUser]));

    for (const fakeToken of fakeTokens) {
      mockStorage.setItem('bellatop_auth_session_v3', JSON.stringify({
        token: fakeToken,
        userId: testUser.id,
        user: testUser,
      }));

      // Construtor aplica o regex estrito: !/^bt_sess_[a-f0-9]{48}_\d+$/.test(token)
      const instanceWithFake = new (mesStore.constructor as any)();

      assert(
        instanceWithFake.authSessionToken === null,
        `Token fictício "${fakeToken.slice(0, 20)}..." descartado e zerado pelo construtor`,
        `authSessionToken não foi descartado`
      );
      assert(instanceWithFake.authenticatedUser === null, 'authenticatedUser zerado pelo construtor');
      assert(instanceWithFake.currentUser === null, 'currentUser zerado pelo construtor');
    }

    // No navegador (window definido), verifyWithServer não permite fallback sem token do servidor
    (global as any).window = {};
    const authResultInBrowser = store.verifyWithServer(testUser, 'qualquer_senha');
    assert(!authResultInBrowser, 'verifyWithServer rejeita fallback de senha no navegador sem emissão do servidor');
    delete (global as any).window;
  }

  // =========================================================================
  // CENÁRIO 4: Falha HTTP não confirma máquinas (mantém na fila/shadow)
  // =========================================================================
  console.log(`\n${colors.bold}4. Falha HTTP em syncMachinesAndUsersToBackend não confirma máquinas${colors.reset}`);
  {
    store.authSessionToken = `bt_sess_${crypto.randomBytes(24).toString('hex')}_${Date.now()}`;
    const mac = store.machines[0];
    const prevShadow = store.machineShadow.get(mac.id);

    // Altera estado da máquina
    mac.productionUnit = 'METROS';
    mac.nominalSpeed = 120;

    // Simula falha HTTP 500 no fetch
    (global as any).window = {};
    (global as any).fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Falha interna de conexão' }),
    });

    store.syncMachinesAndUsersToBackend();
    await new Promise((r) => setTimeout(r, 2200));

    const shadowAfterFail = store.machineShadow.get(mac.id);
    assert(
      shadowAfterFail === prevShadow,
      'Shadow da máquina permanece inalterado quando a escrita no backend falha',
      `Shadow anterior: ${prevShadow}, Shadow após falha: ${shadowAfterFail}`
    );

    delete (global as any).fetch;
    delete (global as any).window;
  }

  // =========================================================================
  // CENÁRIO 5: Edição local pendente resiste a pull remoto (anti-sobrescrita)
  // =========================================================================
  console.log(`\n${colors.bold}5. Edição local pendente resiste a pull remoto (preserva apontamento)${colors.reset}`);
  {
    const testOpId = 'OP_CONCORRENCIA_APONTAMENTO_01';
    const localEditingOp: any = {
      id: testOpId,
      opNumber: 'OP_1001',
      status: 'EM_PRODUCAO',
      steps: [
        {
          id: 'step_cs_01',
          processName: 'Corte e Solda',
          status: 'PRODUZINDO',
          producedQuantity: 3200, // Apontado pelo operador localmente
        },
      ],
      updatedAt: '2026-10-13T14:30:00.000Z',
    };

    store.orders = [localEditingOp];
    store.pendingOrderPushIds.add(testOpId);

    // Servidor retorna versão remota mais antiga ou diferente
    const remoteServerOp: any = {
      ...localEditingOp,
      status: 'PRONTA',
      steps: [
        {
          ...localEditingOp.steps[0],
          status: 'PRONTA',
          producedQuantity: 0,
        },
      ],
      updatedAt: '2026-10-13T14:20:00.000Z',
    };

    (global as any).window = {};
    (global as any).fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [remoteServerOp] }),
    });

    store.syncOrdersFromBackend();
    await new Promise((r) => setTimeout(r, 50));

    const opResult = store.orders.find((o: any) => o.id === testOpId);
    assert(
      opResult.steps[0].status === 'PRODUZINDO' && opResult.steps[0].producedQuantity === 3200,
      'Apontamento local do operador protegido contra sobrescrita remota durante edição pendente'
    );

    delete (global as any).fetch;
    delete (global as any).window;
  }

  // =========================================================================
  // CENÁRIO 6: OP pendente sobrevive à recarga (persistência SYNC_STATE)
  // =========================================================================
  console.log(`\n${colors.bold}6. Fila de reenvio de OPs persiste em disco e sobrevive à recarga${colors.reset}`);
  {
    const opIdToSync = 'OP_PENDENTE_REENVIO_99';
    store.pendingOrderPushIds.clear();
    store.pendingOrderPushIds.add(opIdToSync);
    store.orderBaseVersions.set(opIdToSync, '2026-10-13T13:00:00.000Z');

    store.persistSyncState();

    const storedSync = JSON.parse(mockStorage.getItem('bellatop_sync_state_v1') || '{}');
    assert(
      Array.isArray(storedSync.orders) && storedSync.orders.includes(opIdToSync),
      'pendingOrderPushIds salvo em disco sob a chave bellatop_sync_state_v1'
    );

    // Limpa estado em memória e recarrega do storage
    store.pendingOrderPushIds.clear();
    store.orderBaseVersions.clear();
    store.loadFromStorage();

    assert(
      store.pendingOrderPushIds.has(opIdToSync),
      'pendingOrderPushIds reconstituído após recarga da aplicação'
    );
    assert(
      store.orderBaseVersions.get(opIdToSync) === '2026-10-13T13:00:00.000Z',
      'orderBaseVersions reconstituído após recarga da aplicação'
    );
  }

  // =========================================================================
  // CENÁRIO 7: Concorrência entre dois clientes com mesma versão base (STALE_WRITE)
  // =========================================================================
  console.log(`\n${colors.bold}7. Concorrência: escrita concorrente com mesma versão base retorna STALE_WRITE${colors.reset}`);
  {
    const opId = 'OP_CONCORRENTE_TX';
    const initialStamp = '2026-10-13T10:00:00.000Z';

    inMemoryStore.set(`ops/${opId}`, {
      id: opId,
      opNumber: 'OP_TX_01',
      updatedAt: initialStamp,
    });
    inMemoryStore.set(`ops/${opId}/etapas/step_1`, {
      id: 'step_1',
      status: 'PRONTA',
      sequenceIndex: 1,
    });

    // Cliente A grava alteração com base na versão que leu
    const payloadClienteA: any = {
      id: opId,
      opNumber: 'OP_TX_01',
      _baseUpdatedAt: initialStamp,
      steps: [{ id: 'step_1', status: 'PRODUZINDO', sequenceIndex: 1 }],
    };

    const savedA = await opsRepository.createOp(payloadClienteA);
    assert(Boolean(savedA), 'Cliente A grava primeiro com sucesso');

    const opNoBanco = inMemoryStore.get(`ops/${opId}`);
    assert(opNoBanco.updatedAt > initialStamp, 'Banco atualiza updatedAt após escrita do Cliente A');

    // Cliente B tenta gravar com a MESMA versão base inicial (agora defasada)
    const payloadClienteB: any = {
      id: opId,
      opNumber: 'OP_TX_01',
      _baseUpdatedAt: initialStamp, // Versão antiga!
      steps: [{ id: 'step_1', status: 'PAUSADA', sequenceIndex: 1 }],
    };

    let erroClienteB: any = null;
    try {
      await opsRepository.createOp(payloadClienteB);
    } catch (err: any) {
      erroClienteB = err;
    }

    assert(
      erroClienteB !== null && erroClienteB.code === 'STALE_WRITE',
      'Cliente B rejeitado com STALE_WRITE devido a conflito de versão concorrente',
      erroClienteB ? `Código: ${erroClienteB.code}, Msg: ${erroClienteB.message}` : 'Nenhum erro'
    );
  }

  // =========================================================================
  // CENÁRIO 8: Sessões compartilhadas entre instâncias, logout e inativação
  // =========================================================================
  console.log(`\n${colors.bold}8. Sessões compartilhadas (authSessions): multi-instância, logout e inativação${colors.reset}`);
  {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // Habilita checagem real na coleção authSessions do mockDb

    const userId = 'user_multi_sessao';
    const userPassHash = crypto.createHash('sha256').update('senha123').digest('hex');

    // Usuário cadastrado no mockDb
    inMemoryStore.set(`usuarios/${userId}`, {
      id: userId,
      name: 'Operador Multi-Instância',
      login: 'op_multi',
      role: 'OPERATOR',
      isActive: true,
      passwordHash: userPassHash,
      passwordSalt: 'salt',
    });

    // Instância 1 emite token legítimo
    const token = `bt_sess_${crypto.randomBytes(24).toString('hex')}_${Date.now()}`;
    const tokenKey = crypto.createHash('sha256').update(token.trim()).digest('hex');

    inMemoryStore.set(`authSessions/${tokenKey}`, {
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 8 * 60 * 60 * 1000, // 8 horas
      revoked: false,
      credentialFingerprint: crypto.createHash('sha256').update(userPassHash).digest('hex'),
    });

    // Instância 2 valida o token compartilhado lendo o mockDb
    const validacaoInstancia2 = await ServerAuthService.validateSharedSession(token);
    assert(
      validacaoInstancia2 !== null && validacaoInstancia2.id === userId,
      'Instância 2 valida com sucesso token emitido pela Instância 1'
    );

    // Logout revoga na base compartilhada
    await ServerAuthService.logoutSharedSession(token);
    const aposLogout = await ServerAuthService.validateSharedSession(token);
    assert(aposLogout === null, 'Token revogado via logoutSharedSession é rejeitado imediatamente');

    // Novo token válido para testar inativação de conta
    const token2 = `bt_sess_${crypto.randomBytes(24).toString('hex')}_${Date.now()}`;
    const tokenKey2 = crypto.createHash('sha256').update(token2.trim()).digest('hex');
    inMemoryStore.set(`authSessions/${tokenKey2}`, {
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      revoked: false,
      credentialFingerprint: crypto.createHash('sha256').update(userPassHash).digest('hex'),
    });

    // Inativa usuário no banco
    inMemoryStore.set(`usuarios/${userId}`, {
      ...inMemoryStore.get(`usuarios/${userId}`),
      isActive: false,
    });

    const aposInativacao = await ServerAuthService.validateSharedSession(token2);
    assert(
      aposInativacao === null,
      'Usuário inativado tem sua sessão rejeitada imediatamente'
    );

    process.env.NODE_ENV = originalEnv;
  }

  // =========================================================================
  // RESUMO DOS RESULTADOS
  // =========================================================================
  console.log(`\n${colors.bold}=== RESULTADO DA SUÍTE DE REGRESSÃO ===${colors.reset}`);
  console.log(`Total de asserções executadas: ${passed + failed}`);
  console.log(`Aprovadas: ${colors.green}${passed}${colors.reset}`);
  console.log(`Falhas: ${failed > 0 ? colors.red : colors.green}${failed}${colors.reset}\n`);

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runRegressionSuite().catch((err) => {
  console.error('Erro fatal durante a suíte de regressão:', err);
  process.exit(1);
});
