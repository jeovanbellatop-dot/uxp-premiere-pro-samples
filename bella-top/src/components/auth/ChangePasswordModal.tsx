import React, { useState } from 'react';
import { KeyRound, X, AlertTriangle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useMesStore } from '../../hooks/useMesStore';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { authenticatedUser, changePassword } = useMesStore();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !authenticatedUser) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError('Informe a senha atual.');
      return;
    }
    if (newPassword.length < 4) {
      setError('A nova senha deve ter pelo menos 4 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As novas senhas não coincidem.');
      return;
    }

    const res = changePassword(currentPassword, newPassword);
    if (!res.success) {
      setError(res.error || 'Erro ao alterar senha.');
    } else {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onClose();
      }, 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white border border-line rounded-2xl shadow-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between pb-4 border-b border-line mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-tint border border-brand-soft flex items-center justify-center text-brand">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">Alterar Minha Senha</h3>
              <p className="text-[11px] text-muted">Atualize sua credencial de acesso</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-subtle hover:text-ink p-1 rounded-lg hover:bg-canvas transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Senha alterada com sucesso!</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">
              Senha Atual
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 pr-10 bg-canvas border border-line rounded-xl text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand focus:bg-white transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-subtle hover:text-ink"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">
              Nova Senha
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              placeholder="Mínimo 4 caracteres"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-canvas border border-line rounded-xl text-ink text-sm placeholder-subtle focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand focus:bg-white transition-all font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">
              Confirmar Nova Senha
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-canvas border border-line rounded-xl text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand focus:bg-white transition-all font-mono"
            />
          </div>

          <div className="pt-4 border-t border-line flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-canvas hover:bg-line text-ink text-xs rounded-xl font-bold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-brand hover:bg-brand-dark text-white text-xs rounded-xl font-bold shadow-sm shadow-brand/20 transition-all cursor-pointer"
            >
              Salvar Nova Senha
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
