/**
 * Cria (ou remove) os logins de teste da Bella Top, um por posto de trabalho,
 * usando a própria API do aplicativo publicado. Não precisa da chave do Firebase:
 * basta um login de administrador.
 *
 * Criar:   BELLATOP_URL=https://seu-app.onrender.com ADMIN_USER=admin ADMIN_PASS=... npm run users:test
 * Remover: (mesmas variáveis) npm run users:test -- --remover
 * Trocar as senhas padrão antigas (admin123/123456) por senhas aleatórias:
 *          (mesmas variáveis) npm run users:test -- --trocar-senhas-padrao
 *
 * As senhas são geradas na hora (nunca ficam no código) e saem no terminal e no
 * arquivo logins-teste.csv (fora do Git). Todos os logins começam com "teste_".
 */
import crypto from 'crypto';
import fs from 'fs';

const TEST_USERS: Array<{
  username: string;
  name: string;
  sectors: string[];
  authorizedMachineIds: string[];
  role?: string;
  posto: string;
}> = [
  { username: 'teste_pcp', name: 'Teste PCP', sectors: ['PCP'], authorizedMachineIds: [], role: 'PCP', posto: 'PCP (lançar e liberar OPs)' },
  { username: 'teste_refile', name: 'Teste Refile', sectors: ['REFILE'], authorizedMachineIds: ['REFILADEIRA_01'], posto: 'Refiladeira' },
  { username: 'teste_flexo', name: 'Teste Flexografia', sectors: ['FLEXOGRAFIA'], authorizedMachineIds: ['FLEXOGRAFIA_01'], posto: 'Flexografia' },
  { username: 'teste_estamparia', name: 'Teste Estamparia', sectors: ['ESTAMPARIA'], authorizedMachineIds: ['CARROSSEL_01', 'CARROSSEL_PEQUENA_01'], posto: 'Carrossel e Carrossel Pequena' },
  { username: 'teste_m2', name: 'Teste Máquina 2', sectors: ['CORTE_SOLDA'], authorizedMachineIds: ['m2-corte-solda'], posto: 'Corte e Solda — Máquina 2' },
  { username: 'teste_m3', name: 'Teste Máquina 3', sectors: ['CORTE_SOLDA'], authorizedMachineIds: ['m3-corte-solda'], posto: 'Corte e Solda — Máquina 3' },
  { username: 'teste_m4', name: 'Teste Máquina 4', sectors: ['CORTE_SOLDA'], authorizedMachineIds: ['m4-corte-solda'], posto: 'Corte e Solda — Máquina 4' },
  { username: 'teste_acabamento', name: 'Teste Acabamento', sectors: ['ALCA', 'CORDAO_MANUAL', 'COSTURA'], authorizedMachineIds: ['workstation_proc_colocar_alca', 'workstation_proc_cordao_manual', 'workstation_proc_costura'], posto: 'Alça, Cordão Manual e Costura' },
  { username: 'teste_terceirizado', name: 'Teste Terceirizado', sectors: ['TERCEIRIZADO'], authorizedMachineIds: ['workstation_proc_terceirizado'], posto: 'Recebimento Terceirizado' },
  { username: 'teste_expedicao', name: 'Teste Expedição', sectors: ['EXPEDICAO'], authorizedMachineIds: ['workstation_proc_expedicao'], role: 'EXPEDITION', posto: 'Expedição' },
];

/** Contas que versões antigas criavam sozinhas, com senha escrita no código público. */
const LEGACY_DEFAULT_LOGINS: Array<[string, string]> = [
  ['admin', 'admin123'],
  ['robson', 'admin123'],
  ['elton', '123456'],
  ['toninho', '123456'],
  ['ueltom', '123456'],
  ['teste', '123456'],
];

/** Senha legível de 10 caracteres, sem letras/números que se confundem (0/O, 1/l/I). */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function main() {
  const baseUrl = (process.env.BELLATOP_URL || '').replace(/\/+$/, '');
  const adminUser = process.env.ADMIN_USER || '';
  const adminPass = process.env.ADMIN_PASS || '';
  const remove = process.argv.includes('--remover');
  const rotateDefaults = process.argv.includes('--trocar-senhas-padrao');

  if (!baseUrl || !adminUser || !adminPass) {
    console.error('Informe BELLATOP_URL, ADMIN_USER e ADMIN_PASS. Exemplo:');
    console.error('  BELLATOP_URL=https://bella-top.onrender.com ADMIN_USER=admin ADMIN_PASS=suaSenha npm run users:test');
    process.exit(1);
  }

  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(baseUrl + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data: any = {};
    try { data = await res.json(); } catch { /* resposta sem JSON */ }
    return { status: res.status, data };
  };

  const login = await call('POST', '/api/auth/login', { username: adminUser, password: adminPass });
  if (login.status !== 200 || !login.data?.token) {
    console.error(`Login de administrador falhou (${login.status}): ${login.data?.error || 'sem detalhes'}`);
    process.exit(1);
  }
  const token: string = login.data.token;

  const list = await call('GET', '/api/users', undefined, token);
  if (list.status !== 200) {
    console.error(`Não foi possível listar usuários (${list.status}): ${list.data?.error || ''}. O login precisa ser ADMIN ou MASTER.`);
    process.exit(1);
  }
  const existing: any[] = list.data.users || [];
  const byLogin = new Map(existing.map((u) => [String(u.login || u.username || '').toLowerCase(), u]));

  // Quais contas antigas ainda entram com a senha padrão pública?
  const weak: Array<{ login: string; user: any }> = [];
  for (const [l, pw] of LEGACY_DEFAULT_LOGINS) {
    const u = byLogin.get(l);
    if (!u || u.isActive === false) continue;
    const r = await call('POST', '/api/auth/login', { username: l, password: pw });
    if (r.status === 200 && r.data?.token) {
      weak.push({ login: l, user: u });
      await call('POST', '/api/auth/logout', undefined, r.data.token);
    }
  }

  if (rotateDefaults) {
    // O próprio admin fica por último: trocar a senha dele encerra esta sessão.
    weak.sort((a, b) => Number(a.login === adminUser) - Number(b.login === adminUser));
    const out: Array<{ Login: string; 'Nova senha': string; Situação: string }> = [];
    for (const w of weak) {
      const pw = generatePassword();
      const r = await call('POST', `/api/users/${encodeURIComponent(w.user.id)}/reset-password`, { newPassword: pw }, token);
      out.push({ Login: w.login, 'Nova senha': r.status < 300 ? pw : '-', Situação: r.status < 300 ? 'senha trocada' : 'ERRO: ' + (r.data?.error || r.status) });
    }
    if (!out.length) console.log('Nenhuma conta usa mais as senhas padrão. Nada a trocar.');
    else {
      console.table(out);
      const csv = ['login;nova_senha;situacao', ...out.map((o) => [o.Login, o['Nova senha'], o.Situação].join(';'))].join('\n');
      fs.writeFileSync('senhas-trocadas.csv', csv + '\n', 'utf-8');
      console.log('Novas senhas salvas em senhas-trocadas.csv (não vai para o GitHub). Entregue cada uma ao dono da conta.');
    }
    process.exit(out.some((o) => o.Situação.startsWith('ERRO')) ? 1 : 0);
  }

  if (remove) {
    let n = 0;
    for (const t of TEST_USERS) {
      const u = byLogin.get(t.username);
      if (!u || u.isActive === false) continue;
      const r = await call('PATCH', `/api/users/${encodeURIComponent(u.id)}/status`, { isActive: false }, token);
      console.log(`${r.status < 300 ? '✓' : '✗'} ${t.username} ${r.status < 300 ? 'desativado' : 'erro: ' + (r.data?.error || r.status)}`);
      if (r.status < 300) n++;
    }
    console.log(`\n${n} login(s) de teste desativado(s).`);
    process.exit(0);
  }

  const rows: Array<{ login: string; senha: string; posto: string; situacao: string }> = [];
  for (const t of TEST_USERS) {
    const password = generatePassword();
    const u = byLogin.get(t.username);
    let r: { status: number; data: any };
    let situacao: string;
    if (u) {
      // Já existe: reativa e troca a senha, para a lista final valer de novo.
      if (u.isActive === false) await call('PATCH', `/api/users/${encodeURIComponent(u.id)}/status`, { isActive: true }, token);
      r = await call('POST', `/api/users/${encodeURIComponent(u.id)}/reset-password`, { newPassword: password }, token);
      situacao = 'senha renovada';
    } else {
      const { posto: _posto, ...payload } = t;
      r = await call('POST', '/api/users', { ...payload, password, jobTitle: `Login de teste — ${t.posto}` }, token);
      situacao = 'criado';
    }
    if (r.status >= 300 || r.data?.success === false) situacao = 'ERRO: ' + (r.data?.error || r.status);
    rows.push({ login: t.username, senha: situacao.startsWith('ERRO') ? '-' : password, posto: t.posto, situacao });
  }

  // Confere cada login de verdade na API.
  for (const row of rows) {
    if (row.senha === '-') continue;
    const check = await call('POST', '/api/auth/login', { username: row.login, password: row.senha });
    if (check.status !== 200) row.situacao += ` (login falhou: ${check.data?.error || check.status})`;
    else if (check.data?.token) await call('POST', '/api/auth/logout', undefined, check.data.token);
  }

  console.log('\nLogins de teste — ' + baseUrl + '\n');
  console.table(rows.map((r) => ({ Login: r.login, Senha: r.senha, Posto: r.posto, Situação: r.situacao })));
  const csv = ['login;senha;posto;situacao', ...rows.map((r) => [r.login, r.senha, r.posto, r.situacao].join(';'))].join('\n');
  fs.writeFileSync('logins-teste.csv', csv + '\n', 'utf-8');
  console.log('Lista salva em logins-teste.csv (não vai para o GitHub).');
  console.log('Para desativar todos depois: npm run users:test -- --remover');
  if (weak.length) {
    console.log(`\n⚠ ATENÇÃO: ${weak.length} conta(s) ainda entram com a senha padrão que está no código público: ${weak.map((w) => w.login).join(', ')}.`);
    console.log('  Qualquer pessoa com o link consegue entrar com elas. Troque agora: npm run users:test -- --trocar-senhas-padrao');
  }
  process.exit(rows.some((r) => r.situacao.startsWith('ERRO') || r.situacao.includes('falhou')) ? 1 : 0);
}

main().catch((err) => {
  console.error('Erro ao criar logins de teste:', err?.message || err);
  process.exit(1);
});
