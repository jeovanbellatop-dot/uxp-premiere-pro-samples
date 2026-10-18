import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getFirestoreDb } from './firebaseAdmin';
import { ServerAuditService } from './auditService';
import type { UserRole, SystemSectorCode } from '../src/types/mes';
import { sha256Sync } from '../src/utils/authCrypto';

export interface ServerUser {
  id: string;
  name: string;
  login: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  sectors: SystemSectorCode[];
  role: UserRole;
  jobTitle: string;
  sector: string;
  authorizedMachineIds: string[];
  assignedMachineNames?: string[];
  shift: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginAttempt {
  count: number;
  lastAttempt: number;
  blockedUntil?: number;
}

export interface SessionData {
  userId: string;
  createdAt: number;
  expiresAt: number;
  user: Omit<ServerUser, 'passwordHash' | 'passwordSalt'>;
}

// Utilitários de Hash criptográfico forte usando scrypt nativo do Node.js
export function hashPassword(plainText: string, salt: string): string {
  return crypto.scryptSync(plainText.trim(), salt, 64).toString('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function normalizeUsername(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .trim();
}

export class ServerAuthService {
  private static sessions: Map<string, SessionData> = new Map();
  private static attempts: Map<string, LoginAttempt> = new Map();
  private static masterTempPassword: string | null = null;
  private static masterLoggedOnce = false;

  public static getMasterTempPassword(): string | null {
    return this.masterTempPassword;
  }

  /**
   * Garante a criação do usuário MASTER inicial no primeiro boot, caso nenhum MASTER exista.
   * A senha temporária gerada aleatoriamente é exibida UMA ÚNICA VEZ no log do servidor.
   */
  public static async ensureMasterUser(): Promise<{ created: boolean; login: string; tempPassword?: string }> {
    const db = getFirestoreDb();
    const usersCol = db.collection('usuarios');

    // A inicialização não redefine credenciais de usuários existentes.

    const tempFile = path.join(process.cwd(), '.master_temp_password.txt');
    if (!this.masterTempPassword && fs.existsSync(tempFile)) {
      try {
        this.masterTempPassword = fs.readFileSync(tempFile, 'utf-8').trim();
      } catch {
        // ignore
      }
    }

    // Verifica se já existe algum usuário MASTER
    const masterDoc = await usersCol.doc('user_master').get();
    if (masterDoc.exists) {
      const data = masterDoc.data() as ServerUser;
      return { created: false, login: 'master' };
    }

    // Gera senha temporária aleatória e segura para o primeiro acesso
    const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
    const tempPassword = `Master_${randomHex}`;
    const salt = generateSalt();
    const pHash = hashPassword(tempPassword, salt);
    const now = new Date().toISOString();

    const masterUser: ServerUser = {
      id: 'user_master',
      name: 'Master Bella Top',
      login: 'master',
      username: 'master',
      passwordHash: pHash,
      passwordSalt: salt,
      sectors: ['ADMIN', 'PCP', 'REFILE', 'FLEXOGRAFIA', 'ESTAMPARIA', 'CORTE_SOLDA', 'ALCA', 'EXPEDICAO'],
      role: 'MASTER',
      jobTitle: 'Administrador Master do Sistema',
      sector: 'ADMIN',
      authorizedMachineIds: ['*'],
      shift: 'GERAL',
      isActive: true,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    };

    await usersCol.doc('user_master').set(masterUser);
    this.masterTempPassword = tempPassword;
    try {
      fs.writeFileSync(tempFile, tempPassword, 'utf-8');
    } catch {
      // ignore
    }

    if (!this.masterLoggedOnce) {
      this.masterLoggedOnce = true;
      console.log('\n================================================================================');
      console.log('[Bella Top MES] PRIMEIRO BOOT - USUÁRIO MASTER INICIAL CRIADO NO FIRESTORE:');
      console.log('[Bella Top MES] Usuário: master');
      console.log(`[Bella Top MES] Senha temporária: ${tempPassword}`);
      console.log('[Bella Top MES] Localização do arquivo: .master_temp_password.txt');
      console.log('[Bella Top MES] ATENÇÃO: Troca de senha obrigatória no primeiro acesso!');
      console.log('================================================================================\n');
    }

    ServerAuditService.log({
      action: 'MASTER_USER_INITIALIZED',
      entityType: 'USER',
      entityId: 'user_master',
      details: 'Usuário MASTER inicial criado no Firestore com senha temporária única.',
    });

    return { created: true, login: 'master', tempPassword };
  }

  /**
   * Garante que todas as contas de usuário padrão da fábrica existam no Firestore
   */
  public static async ensureDefaultUsers(): Promise<void> {
    // As senhas abaixo estao no codigo-fonte publico: criar essas contas num servidor
    // real abre o sistema para qualquer um. So para ambientes de demonstracao.
    if (process.env.BELLATOP_SEED_DEMO_USERS !== '1') return;

    const db = getFirestoreDb();
    const usersCol = db.collection('usuarios');
    const now = new Date().toISOString();

    const defaults: Array<{
      id: string;
      name: string;
      login: string;
      role: UserRole;
      sectors: SystemSectorCode[];
      jobTitle: string;
      sector: string;
      defaultPass: string;
    }> = [
      {
        id: 'user_admin',
        name: 'Administrador Bella Top',
        login: 'admin',
        role: 'ADMIN',
        sectors: ['ADMIN', 'PCP'],
        jobTitle: 'Administrador Geral',
        sector: 'ADMIN',
        defaultPass: 'admin123',
      },
      {
        id: 'user_robson',
        name: 'Robson Silva',
        login: 'robson',
        role: 'PCP',
        sectors: ['PCP'],
        jobTitle: 'Planejamento e Controle de Produção',
        sector: 'PCP',
        defaultPass: 'admin123',
      },
      {
        id: 'user_elton',
        name: 'Elton Silva',
        login: 'elton',
        role: 'OPERATOR',
        sectors: ['REFILE', 'FLEXOGRAFIA'],
        jobTitle: 'Operador de Refile e Flexografia',
        sector: 'REFILE',
        defaultPass: '123456',
      },
      {
        id: 'user_toninho',
        name: 'Toninho Santos',
        login: 'toninho',
        role: 'OPERATOR',
        sectors: ['CORTE_SOLDA', 'ALCA'],
        jobTitle: 'Supervisor e Operador de Corte e Solda',
        sector: 'CORTE_SOLDA',
        defaultPass: '123456',
      },
      {
        id: 'user_ueltom',
        name: 'Ueltom Oliveira',
        login: 'ueltom',
        role: 'OPERATOR',
        sectors: ['REFILE'],
        jobTitle: 'Operador de Refile',
        sector: 'REFILE',
        defaultPass: '123456',
      },
      {
        id: 'user_teste',
        name: 'Operador de Teste',
        login: 'teste',
        role: 'OPERATOR',
        sectors: ['CORTE_SOLDA', 'REFILE'],
        jobTitle: 'Operador Geral de Testes',
        sector: 'CORTE_SOLDA',
        defaultPass: '123456',
      },
    ];

    for (const def of defaults) {
      const existing = await this.getUserByLogin(def.login);
      if (!existing) {
        const salt = generateSalt();
        const pHash = hashPassword(def.defaultPass, salt);
        const newUser: ServerUser = {
          id: def.id,
          name: def.name,
          login: def.login,
          username: def.login,
          passwordHash: pHash,
          passwordSalt: salt,
          sectors: def.sectors,
          role: def.role,
          jobTitle: def.jobTitle,
          sector: def.sector,
          authorizedMachineIds: ['*'],
          shift: 'TURNO_1',
          isActive: true,
          mustChangePassword: false,
          createdAt: now,
          updatedAt: now,
        };
        await usersCol.doc(def.id).set(newUser);
      }
    }
  }

  /**
   * Busca usuário no Firestore por login ou username normalizado
   */
  public static async getUserByLogin(rawUsername: string): Promise<ServerUser | null> {
    const norm = normalizeUsername(rawUsername);
    if (!norm) return null;

    const db = getFirestoreDb();
    const usersCol = db.collection('usuarios');

    // 1. Tenta buscar direto por doc ID
    const docById = await usersCol.doc(norm).get();
    if (docById.exists) {
      return docById.data() as ServerUser;
    }
    const docByPrefixedId = await usersCol.doc(`user_${norm}`).get();
    if (docByPrefixedId.exists) {
      return docByPrefixedId.data() as ServerUser;
    }

    // 2. Busca por campo login
    const qLogin = await usersCol.where('login', '==', norm).limit(1).get();
    if (!qLogin.empty) {
      return qLogin.docs[0].data() as ServerUser;
    }

    // 3. Busca por campo username
    const qUsername = await usersCol.where('username', '==', norm).limit(1).get();
    if (!qUsername.empty) {
      return qUsername.docs[0].data() as ServerUser;
    }

    // 4. Fallback: listar todos e comparar normalizado
    const allSnap = await usersCol.get();
    for (const d of allSnap.docs) {
      const u = d.data() as ServerUser;
      if (normalizeUsername(u.login) === norm || normalizeUsername(u.username) === norm) {
        return u;
      }
    }

    return null;
  }

  /**
   * Autenticação de usuário com Firestore e bloqueio após 5 tentativas por 15 minutos
   */
  public static async login(
    rawUsername: string,
    plainPassword: string
  ): Promise<{
    success: boolean;
    user?: Omit<ServerUser, 'passwordHash' | 'passwordSalt'>;
    token?: string;
    mustChangePassword?: boolean;
    error?: string;
    blockedRemainingSeconds?: number;
  }> {
    const norm = normalizeUsername(rawUsername);
    const now = Date.now();

    // 1. Verificação de Bloqueio por Força Bruta (5 tentativas -> 15 minutos = 900.000 ms)
    const attempt = this.attempts.get(norm);
    if (attempt && attempt.blockedUntil && attempt.blockedUntil > now) {
      const remainingSec = Math.ceil((attempt.blockedUntil - now) / 1000);
      ServerAuditService.log({
        action: 'AUTH_BLOCKED_ATTEMPTS',
        entityType: 'AUTH',
        entityId: norm,
        details: `Tentativa de login bloqueada temporariamente para o usuário "${rawUsername}". Restam ${remainingSec}s`,
      });
      return {
        success: false,
        error: `Muitas tentativas incorretas. Acesso bloqueado por 15 minutos. Aguarde ${Math.ceil(remainingSec / 60)} minuto(s).`,
        blockedRemainingSeconds: remainingSec,
      };
    }

    const user = await this.getUserByLogin(norm);

    if (!user) {
      this.recordFailedAttempt(norm);
      ServerAuditService.log({
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'AUTH',
        entityId: norm,
        details: `Tentativa de login com usuário inexistente: "${rawUsername}"`,
      });
      return { success: false, error: 'Nome de usuário ou senha incorretos.' };
    }

    if (!user.isActive) {
      ServerAuditService.log({
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'AUTH',
        entityId: user.id,
        details: `Tentativa de login com conta inativa: ${user.name} (@${user.login})`,
      });
      return { success: false, error: 'Esta conta está inativa. Contate o Administrador.' };
    }

    // Validação com scrypt e salt único do usuário.
    // Usuários criados/redefinidos pelo painel no navegador recebem hash SHA-256
    // (`salt:senha`), porque o navegador não tem scrypt. Antes, esses logins
    // sempre davam "senha incorreta" até alguém republicar o sistema.
    // Agora o formato do navegador também é aceito e migrado para scrypt na hora.
    const salt = user.passwordSalt || '';
    const computedHash = salt ? hashPassword(plainPassword, salt) : '';
    const legacyBrowserHash = salt ? sha256Sync(`${salt}:${plainPassword.trim()}`) : '';
    const matchesScrypt = !!computedHash && computedHash === user.passwordHash;
    const matchesBrowser = !matchesScrypt && !!legacyBrowserHash && legacyBrowserHash === user.passwordHash;

    if (matchesBrowser) {
      try {
        const newSalt = generateSalt();
        const upgradedHash = hashPassword(plainPassword, newSalt);
        await getFirestoreDb().collection('usuarios').doc(user.id).update({
          passwordSalt: newSalt,
          passwordHash: upgradedHash,
          updatedAt: new Date().toISOString(),
        });
        user.passwordSalt = newSalt;
        user.passwordHash = upgradedHash;
      } catch (e) {
        console.warn('[Auth] Não foi possível migrar hash do usuário para scrypt:', e);
      }
    }

    if (!matchesScrypt && !matchesBrowser) {
      this.recordFailedAttempt(norm);
      ServerAuditService.log({
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'AUTH',
        entityId: user.id,
        details: `Senha incorreta para o usuário: ${user.name} (@${user.login})`,
      });
      return { success: false, error: 'Nome de usuário ou senha incorretos.' };
    }

    // Sucesso: limpa tentativas incorretas
    this.attempts.delete(norm);

    const db = getFirestoreDb();
    const timestamp = new Date().toISOString();
    try {
      await db.collection('usuarios').doc(user.id).update({
        lastLoginAt: timestamp,
        updatedAt: timestamp,
      });
    } catch {
      // continua mesmo com erro no carimbo de último login
    }

    // Emissão de token de sessão válido por 24 horas
    const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;
    const token = `bt_sess_${crypto.randomBytes(24).toString('hex')}_${now}`;
    const { passwordHash: _h, passwordSalt: _s, ...safeUser } = user;

    // Token opaco: apenas seu hash é persistido no banco, compartilhado pelas instâncias.
    if (process.env.NODE_ENV !== 'test') {
      await db.collection('authSessions').doc(crypto.createHash('sha256').update(token).digest('hex')).set({
        userId: user.id,
        createdAt: now,
        expiresAt: now + SESSION_EXPIRY_MS,
        revoked: false,
        credentialFingerprint: crypto.createHash('sha256').update(user.passwordHash).digest('hex'),
      });
    }

    this.sessions.set(token, {
      userId: user.id,
      createdAt: now,
      expiresAt: now + SESSION_EXPIRY_MS,
      user: safeUser,
    });

    ServerAuditService.log({
      action: 'AUTH_LOGIN_SUCCESS',
      entityType: 'AUTH',
      entityId: user.id,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      details: `Login bem-sucedido: ${user.name} (@${user.login}) [${user.role}]`,
    });

    return {
      success: true,
      user: safeUser,
      token,
      mustChangePassword: Boolean(user.mustChangePassword),
    };
  }

  /** Validação persistente: sobrevive a reinícios e lê permissões/atividade atuais. */
  public static async validateSharedSession(token: string): Promise<Omit<ServerUser, 'passwordHash' | 'passwordSalt'> | null> {
    if (process.env.NODE_ENV === 'test') return this.validateSession(token);
    if (!token || typeof token !== 'string') return null;
    try {
      const db = getFirestoreDb();
      const key = crypto.createHash('sha256').update(token.trim()).digest('hex');
      const snap = await db.collection('authSessions').doc(key).get();
      const session = snap.data();
      if (!session || session.revoked || !session.userId || !Number.isFinite(session.expiresAt) || Date.now() >= session.expiresAt) return null;
      const userSnap = await db.collection('usuarios').doc(session.userId).get();
      if (!userSnap.exists) return null;
      const user = userSnap.data() as ServerUser;
      if (!user.isActive || crypto.createHash('sha256').update(user.passwordHash || '').digest('hex') !== session.credentialFingerprint) return null;
      const { passwordHash, passwordSalt, ...safeUser } = user;
      return safeUser;
    } catch (error) {
      console.error('[Auth] Não foi possível validar a sessão compartilhada.');
      return null;
    }
  }

  public static async logoutSharedSession(token: string): Promise<boolean> {
    if (!token) return false;
    this.logoutSession(token);
    if (process.env.NODE_ENV === 'test') return true;
    const key = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const ref = getFirestoreDb().collection('authSessions').doc(key);
    const snap = await ref.get();
    if (snap.exists) await ref.update({ revoked: true, revokedAt: Date.now() });
    return true;
  }

  /**
   * Valida se o token de sessão é autêntico e não expirou
   */
  public static validateSession(token: string): Omit<ServerUser, 'passwordHash' | 'passwordSalt'> | null {
    if (!token || typeof token !== 'string') return null;
    const cleanToken = token.trim();
    const session = this.sessions.get(cleanToken);
    if (!session) return null;

    const now = Date.now();
    if (now > session.expiresAt) {
      this.sessions.delete(cleanToken);
      return null;
    }

    if (!session.user.isActive) {
      this.sessions.delete(cleanToken);
      return null;
    }

    return session.user;
  }

  /**
   * Encerra sessão ativa (Logout)
   */
  public static logoutSession(token: string): boolean {
    if (!token) return false;
    return this.sessions.delete(token.trim());
  }

  /**
   * Cria sessão programática (útil em testes automatizados)
   */
  public static createSessionForUser(user: ServerUser): string {
    const now = Date.now();
    const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;
    const token = `bt_sess_${crypto.randomBytes(24).toString('hex')}_${now}`;
    const { passwordHash: _h, passwordSalt: _s, ...safeUser } = user;

    this.sessions.set(token, {
      userId: user.id,
      createdAt: now,
      expiresAt: now + SESSION_EXPIRY_MS,
      user: safeUser,
    });

    return token;
  }

  /**
   * Troca de senha pelo próprio usuário autenticado
   */
  public static async changePasswordSelf(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    const db = getFirestoreDb();
    const userDocRef = db.collection('usuarios').doc(userId);
    const snap = await userDocRef.get();

    if (!snap.exists) {
      return { success: false, error: 'Usuário não localizado no banco de dados.' };
    }

    const user = snap.data() as ServerUser;
    const expectedHash = hashPassword(currentPassword, user.passwordSalt);
    if (expectedHash !== user.passwordHash) {
      return { success: false, error: 'A senha atual está incorreta.' };
    }

    if (!newPassword || newPassword.trim().length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' };
    }

    if (newPassword.trim() === currentPassword.trim()) {
      return { success: false, error: 'A nova senha deve ser diferente da senha atual.' };
    }

    const newSalt = generateSalt();
    const newHash = hashPassword(newPassword, newSalt);
    const now = new Date().toISOString();

    await userDocRef.update({
      passwordHash: newHash,
      passwordSalt: newSalt,
      mustChangePassword: false,
      updatedAt: now,
    });

    if (user.id === 'user_master') {
      this.masterTempPassword = null;
      const tempFile = path.join(process.cwd(), '.master_temp_password.txt');
      if (fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch {
          // ignore
        }
      }
    }

    // Atualiza sessões ativas com o status mustChangePassword: false
    for (const [t, s] of this.sessions.entries()) {
      if (s.userId === userId) {
        s.user.mustChangePassword = false;
        this.sessions.set(t, s);
      }
    }

    ServerAuditService.log({
      action: 'AUTH_PASSWORD_CHANGED',
      entityType: 'USER',
      entityId: userId,
      userId,
      userName: user.name,
      details: `Senha alterada com sucesso pelo próprio usuário ${user.name} (@${user.login}).`,
    });

    return { success: true };
  }

  /**
   * Lista usuários cadastrados no Firestore (sem expor credenciais)
   */
  public static async getUsers(): Promise<Omit<ServerUser, 'passwordHash' | 'passwordSalt'>[]> {
    const db = getFirestoreDb();
    const snap = await db.collection('usuarios').get();
    return snap.docs.map((d) => {
      const { passwordHash: _h, passwordSalt: _s, ...safe } = d.data() as ServerUser;
      return safe;
    });
  }

  /**
   * Cria novo usuário no Firestore (apenas ADMIN ou MASTER)
   */
  public static async createUser(
    adminUserId: string,
    params: {
      name: string;
      username: string;
      password: string;
      sectors: SystemSectorCode[];
      role?: UserRole;
      authorizedMachineIds?: string[];
      jobTitle?: string;
      sector?: string;
      shift?: string;
    }
  ): Promise<{ success: boolean; user?: Omit<ServerUser, 'passwordHash' | 'passwordSalt'>; error?: string }> {
    const norm = normalizeUsername(params.username);
    if (!norm) {
      return { success: false, error: 'Nome de usuário inválido.' };
    }

    const existing = await this.getUserByLogin(norm);
    if (existing) {
      return { success: false, error: 'Já existe um usuário cadastrado com este nome de acesso.' };
    }

    if (!params.password || params.password.length < 6) {
      return { success: false, error: 'A senha deve conter ao menos 6 caracteres.' };
    }

    if (!params.sectors || params.sectors.length === 0) {
      return { success: false, error: 'Selecione ao menos um setor/função para o usuário.' };
    }

    const salt = generateSalt();
    const pHash = hashPassword(params.password, salt);
    const id = `user_${norm}_${Date.now()}`;
    const now = new Date().toISOString();

    const role: UserRole = params.role || (params.sectors.includes('ADMIN') ? 'ADMIN' : params.sectors.includes('PCP') ? 'PCP' : 'OPERATOR');

    const newUser: ServerUser = {
      id,
      name: params.name.trim(),
      login: norm,
      username: norm,
      passwordHash: pHash,
      passwordSalt: salt,
      sectors: params.sectors,
      role,
      jobTitle: params.jobTitle || `Operador de ${params.sectors.join('/')}`,
      sector: params.sector || params.sectors.join(', '),
      authorizedMachineIds:
        params.authorizedMachineIds && params.authorizedMachineIds.length > 0
          ? params.authorizedMachineIds
          : role === 'ADMIN' || role === 'MASTER' || role === 'PCP' || role === 'MANAGER'
          ? ['*']
          : [],
      shift: params.shift || 'TURNO_1',
      isActive: true,
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
    };

    const db = getFirestoreDb();
    await db.collection('usuarios').doc(id).set(newUser);

    ServerAuditService.log({
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: id,
      userId: adminUserId,
      details: `Novo acesso criado: ${newUser.name} (@${newUser.login}) com funções: [${newUser.sectors.join(', ')}] por Admin ID: ${adminUserId}`,
    });

    const { passwordHash: _h, passwordSalt: _s, ...safe } = newUser;
    return { success: true, user: safe };
  }

  /**
   * Atualiza usuário no Firestore (apenas ADMIN ou MASTER)
   */
  public static async updateUser(
    adminUserId: string,
    id: string,
    params: {
      name?: string;
      sectors?: SystemSectorCode[];
      role?: UserRole;
      authorizedMachineIds?: string[];
      jobTitle?: string;
      sector?: string;
      shift?: string;
      isActive?: boolean;
    }
  ): Promise<{ success: boolean; user?: Omit<ServerUser, 'passwordHash' | 'passwordSalt'>; error?: string }> {
    const db = getFirestoreDb();
    const docRef = db.collection('usuarios').doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
      return { success: false, error: 'Usuário não encontrado.' };
    }

    const current = snap.data() as ServerUser;
    const updates: Partial<ServerUser> = {
      updatedAt: new Date().toISOString(),
    };

    if (params.name) updates.name = params.name.trim();
    if (params.sectors && params.sectors.length > 0) {
      updates.sectors = params.sectors;
      updates.role = params.role || (params.sectors.includes('ADMIN') ? 'ADMIN' : params.sectors.includes('PCP') ? 'PCP' : 'OPERATOR');
    }
    if (params.role) updates.role = params.role;
    if (params.authorizedMachineIds) updates.authorizedMachineIds = params.authorizedMachineIds;
    if (params.jobTitle) updates.jobTitle = params.jobTitle;
    if (params.sector) updates.sector = params.sector;
    if (params.shift) updates.shift = params.shift;
    if (typeof params.isActive === 'boolean') updates.isActive = params.isActive;

    await docRef.update(updates);
    const updated = { ...current, ...updates };

    ServerAuditService.log({
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: id,
      userId: adminUserId,
      details: `Acesso atualizado para ${updated.name} (@${updated.login}) - Status: ${updated.isActive ? 'ATIVO' : 'INATIVO'} por Admin ID: ${adminUserId}`,
    });

    const { passwordHash: _h, passwordSalt: _s, ...safe } = updated;
    return { success: true, user: safe };
  }

  /**
   * Ativa ou desativa o status de um usuário (apenas ADMIN ou MASTER)
   */
  public static async toggleUserStatus(
    adminUserId: string,
    targetUserId: string,
    isActive: boolean
  ): Promise<{ success: boolean; user?: Omit<ServerUser, 'passwordHash' | 'passwordSalt'>; error?: string }> {
    return this.updateUser(adminUserId, targetUserId, { isActive });
  }

  /**
   * Redefine senha de um usuário (apenas ADMIN ou MASTER)
   */
  public static async resetPassword(
    adminUserId: string,
    targetUserId: string,
    newPlainPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    const db = getFirestoreDb();
    const docRef = db.collection('usuarios').doc(targetUserId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return { success: false, error: 'Usuário não encontrado.' };
    }

    if (!newPlainPassword || newPlainPassword.length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' };
    }

    const salt = generateSalt();
    const pHash = hashPassword(newPlainPassword, salt);
    const now = new Date().toISOString();

    await docRef.update({
      passwordSalt: salt,
      passwordHash: pHash,
      mustChangePassword: true,
      updatedAt: now,
    });

    const user = snap.data() as ServerUser;
    this.attempts.delete(normalizeUsername(user.login));

    ServerAuditService.log({
      action: 'AUTH_PASSWORD_RESET',
      entityType: 'USER',
      entityId: targetUserId,
      userId: adminUserId,
      details: `Senha redefinida pelo Administrador ID ${adminUserId} para o usuário ${user.name} (@${user.login})`,
    });

    return { success: true };
  }

  /**
   * Exclui permanentemente uma conta de usuário (apenas ADMIN ou MASTER).
   * Contas protegidas (master e admin) e o próprio usuário logado não podem ser excluídos.
   */
  public static async deleteUser(
    adminUserId: string,
    targetUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!adminUserId || !targetUserId) {
      return { success: false, error: 'Identificadores de usuário inválidos.' };
    }

    if (adminUserId === targetUserId) {
      return { success: false, error: 'Não é permitido excluir o próprio usuário logado.' };
    }

    const db = getFirestoreDb();
    const docRef = db.collection('usuarios').doc(targetUserId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return { success: false, error: 'Usuário não encontrado.' };
    }

    const user = snap.data() as ServerUser;
    const normLogin = normalizeUsername(user.login || user.username || '');
    const isProtected =
      normLogin === 'master' ||
      normLogin === 'admin' ||
      targetUserId === 'user_master' ||
      targetUserId === 'user_admin';

    if (isProtected) {
      return {
        success: false,
        error: 'Os usuários protegidos do sistema (master e admin) não podem ser excluídos. Eles devem ser apenas desativados.',
      };
    }

    // 1. Invalida sessões ativas do usuário excluído
    for (const [token, session] of this.sessions.entries()) {
      if (session.userId === targetUserId) {
        this.sessions.delete(token);
      }
    }
    this.attempts.delete(normLogin);

    // 2. Exclui o documento da coleção de usuários no Firestore
    await docRef.delete();

    // 3. Registra a exclusão na auditoria (sem apagar histórico operacional/auditoria anterior)
    ServerAuditService.log({
      action: 'USUARIO_EXCLUIDO',
      entityType: 'USER',
      entityId: targetUserId,
      userId: adminUserId,
      details: `Conta de usuário excluída permanentemente: ${user.name} (@${user.login}) por Administrador ID: ${adminUserId}`,
    });

    return { success: true };
  }

  private static recordFailedAttempt(normUsername: string) {
    const now = Date.now();
    const current = this.attempts.get(normUsername) || { count: 0, lastAttempt: now };
    current.count += 1;
    current.lastAttempt = now;

    // Se falhar 5 vezes seguidas -> bloqueio de 15 minutos (15 * 60 * 1000 ms)
    if (current.count >= 5) {
      current.blockedUntil = now + 15 * 60 * 1000;
    }

    this.attempts.set(normUsername, current);
  }
}
