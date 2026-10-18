import { Router, Request, Response } from 'express';
import { ServerAuthService, isOpenAccessMode } from '../authService';
import { getFirestoreDb, explainFirestoreError } from '../firebaseAdmin';

export const authRoutes = Router();

// POST /api/auth/login - Autenticação obrigatória e verificação de senha forte
authRoutes.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Nome de usuário e senha são obrigatórios.',
      });
    }

    const result = await ServerAuthService.login(username, password);
    if (!result.success) {
      return res.status(result.blockedRemainingSeconds ? 429 : 401).json(result);
    }

    return res.json(result);
  } catch (err: any) {
    console.error('[AuthRoutes] Erro durante o login:', err);
    return res.status(500).json({
      success: false,
      error: 'Erro interno durante a autenticação.',
    });
  }
});

// GET /api/auth/login-options - Lista pública (sem senhas) de usuários ativos para os seletores da tela de login
authRoutes.get('/login-options', async (_req: Request, res: Response) => {
  try {
    const usersCol = getFirestoreDb().collection('usuarios');
    let snap = await usersCol.get();
    const hasActiveAdmin = (docs: any[]) =>
      docs.some((d: any) => {
        const u = d.data() || {};
        return u.isActive !== false && (u.role === 'ADMIN' || u.role === 'MASTER' || (Array.isArray(u.sectors) && u.sectors.includes('ADMIN')));
      });
    // Modo de teste num banco ainda sem administrador (ex.: a preparação do banco falhou ou
    // ainda não terminou): cadastra os logins da fábrica agora, para a tela não ficar travada.
    if (isOpenAccessMode() && !hasActiveAdmin(snap.docs)) {
      await ServerAuthService.ensureMasterUser();
      await ServerAuthService.ensureDefaultUsers();
      snap = await usersCol.get();
    }
    const users = snap.docs
      .map((d: any) => {
        const { passwordHash, passwordSalt, ...safe } = d.data() || {};
        return safe;
      })
      .filter((u: any) => u && u.isActive !== false);
    return res.json({ success: true, users, openAccess: isOpenAccessMode() });
  } catch (err: any) {
    console.error('[AuthRoutes] Erro ao listar opções de login:', err);
    return res.status(500).json({
      success: false,
      users: [],
      openAccess: isOpenAccessMode(),
      error: 'O servidor não conseguiu ler os usuários no banco de dados (Firebase). ' + explainFirestoreError(err),
    });
  }
});

// POST /api/auth/logout - Encerra a sessão ativa
authRoutes.post('/logout', async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'] as string;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : String(req.headers['x-session-token'] || '').trim();
  try {
    if (token) await ServerAuthService.logoutSharedSession(token);
    return res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
  } catch {
    return res.status(503).json({ success: false, error: 'Não foi possível encerrar a sessão no servidor.' });
  }
});

// POST /api/auth/change-password - Troca de senha pelo próprio usuário
authRoutes.post('/change-password', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers['authorization'] as string;
    const sessionTokenHeader = req.headers['x-session-token'] as string;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7).trim()
      : (sessionTokenHeader || '').trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Acesso não autorizado. Sessão obrigatória.',
      });
    }

    const user = await ServerAuthService.validateSharedSession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Sessão inválida ou expirada. Faça login novamente.',
      });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Senha atual e nova senha são obrigatórias.',
      });
    }

    const result = await ServerAuthService.changePasswordSelf(user.id, currentPassword, newPassword);
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err: any) {
    console.error('[AuthRoutes] Erro ao alterar senha:', err);
    return res.status(500).json({
      success: false,
      error: 'Erro ao processar alteração de senha.',
    });
  }
});

// ---------------------------------------------------------------------------
// Cadastro de usuário e redefinição de senha pelo painel (somente Admin/Master).
// A senha é gerada com scrypt AQUI no servidor e gravada no Firestore na hora,
// então o novo login funciona em qualquer aparelho sem republicar o sistema.
// ---------------------------------------------------------------------------
async function getAdminFromRequest(req: Request): Promise<any | null> {
  const authHeader = req.headers['authorization'] as string;
  const sessionTokenHeader = req.headers['x-session-token'] as string;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7).trim()
    : (sessionTokenHeader || '').trim();
  if (!token) return null;
  const user: any = await ServerAuthService.validateSharedSession(token);
  if (!user) return null;
  const role = String(user.role || '').toUpperCase();
  const isAdmin = role === 'ADMIN' || role === 'MASTER' || (Array.isArray(user.sectors) && user.sectors.includes('ADMIN'));
  return isAdmin ? user : null;
}

// POST /api/auth/users - Cria usuário com senha segura
authRoutes.post('/users', async (req: Request, res: Response) => {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Apenas Administrador pode cadastrar usuários. Saia e entre novamente como Administrador.' });
    }
    const result = await ServerAuthService.createUser(admin.id, req.body || {});
    return res.status(result.success ? 201 : 400).json(result);
  } catch (err: any) {
    console.error('[AuthRoutes] Erro ao criar usuário:', err);
    return res.status(500).json({ success: false, error: 'Erro ao gravar o usuário no banco de dados.' });
  }
});

// POST /api/auth/users/:userId/reset-password - Redefine a senha
authRoutes.post('/users/:userId/reset-password', async (req: Request, res: Response) => {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Apenas Administrador pode redefinir senhas.' });
    }
    const result = await ServerAuthService.resetPassword(admin.id, req.params.userId, (req.body || {}).newPassword);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (err: any) {
    console.error('[AuthRoutes] Erro ao redefinir senha:', err);
    return res.status(500).json({ success: false, error: 'Erro ao gravar a nova senha no banco de dados.' });
  }
});

// DELETE /api/auth/users/:userId - Exclui usuário permanentemente
authRoutes.delete('/users/:userId', async (req: Request, res: Response) => {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Apenas Administrador pode excluir usuários.' });
    }
    const result = await ServerAuthService.deleteUser(admin.id, req.params.userId);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (err: any) {
    console.error('[AuthRoutes] Erro ao excluir usuário:', err);
    return res.status(500).json({ success: false, error: 'Erro ao excluir o usuário do banco de dados.' });
  }
});

// GET /api/auth/me - Valida a sessão e retorna os dados do usuário autenticado
authRoutes.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'] as string;
  const sessionTokenHeader = req.headers['x-session-token'] as string;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7).trim()
    : (sessionTokenHeader || '').trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Sessão não fornecida.',
    });
  }

  const user = await ServerAuthService.validateSharedSession(token);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Sessão inválida ou expirada.',
    });
  }

  return res.json({
    success: true,
    user,
  });
});
