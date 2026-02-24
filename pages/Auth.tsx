import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { UserRole } from '../types';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

interface AuthProps {
  onSuccess?: () => void;
}

const Auth: React.FC<AuthProps> = ({ onSuccess }) => {
  const { login, register, resetPassword, updatePassword, loginWithGoogle, loginWithTelegram } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(() => {
    return searchParams.get('mode') !== 'register';
  });
  const [isReset, setIsReset] = useState(() => searchParams.get('mode') === 'reset');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [isResetPasswordVisible, setIsResetPasswordVisible] = useState(false);
  const [role, setRole] = useState<UserRole>(UserRole.CUSTOMER);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const mode = searchParams.get('mode');
    const roleParam = searchParams.get('role');
    const deleted = searchParams.get('deleted');
    const recoveryInHash = typeof window !== 'undefined' && /type=recovery/i.test(window.location.hash);

    if (mode === 'reset' || recoveryInHash) {
      setIsReset(true);
      setIsLogin(true);
    } else {
      setIsReset(false);
      if (mode === 'register') setIsLogin(false);
      else if (mode === 'login') setIsLogin(true);
    }

    if (roleParam === 'EXECUTOR') {
      setRole(UserRole.EXECUTOR);
    } else if (roleParam === 'CUSTOMER') {
      setRole(UserRole.CUSTOMER);
    }

    if (deleted === '1') {
      setIsLogin(false);
      setTimeout(() => {
        toast.success('Аккаунт удалён. Зарегистрируйтесь заново.');
      }, 0);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReset) return;
    if (!isLogin && !termsAccepted) {
      toast.error('Необходимо принять условия публичной оферты');
      return;
    }

    setIsLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
        toast.success('С возвращением!');
      } else {
        if (!name) {
          toast.error('Пожалуйста, введите ваше имя');
          setIsLoading(false);
          return;
        }
        await register(name, email, password, role);
        toast.success('Регистрация успешна!');
      }
      if (onSuccess) onSuccess();
      else navigate('/dashboard');
    } catch (error: any) {
      const msg = error?.message || 'Произошла ошибка';
      if (isLogin && /invalid login credentials/i.test(msg)) {
        toast.error('Неверный email или пароль');
        return;
      }
      if (isLogin && /подтвердите email/i.test(msg)) {
        toast.error(msg);
        return;
      }
      if (isLogin && /профиль не создан/i.test(msg)) {
        setIsLogin(false);
        toast(msg);
        return;
      }
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReset) return;
    if (!resetPasswordValue || resetPasswordValue.length < 6) {
      toast.error('Пароль должен быть не короче 6 символов');
      return;
    }
    if (resetPasswordValue !== resetPasswordConfirm) {
      toast.error('Пароли не совпадают');
      return;
    }
    setIsLoading(true);
    try {
      await updatePassword(resetPasswordValue);
      toast.success('Пароль обновлён. Войдите с новым паролем.');
      setResetPasswordValue('');
      setResetPasswordConfirm('');
      setIsReset(false);
      setIsLogin(true);
      navigate('/auth?mode=login', { replace: true });
    } catch (error: any) {
      toast.error(error?.message || 'Не удалось обновить пароль');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const targetEmail = email.trim();
    if (!targetEmail) {
      toast.error('Введите email для восстановления пароля');
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(targetEmail);
      toast.success('Письмо для восстановления пароля отправлено');
    } catch (error: any) {
      toast.error(error?.message || 'Не удалось отправить письмо');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      await loginWithGoogle();
      toast.success('Успешный вход через Google!');
      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      toast.error('Ошибка входа через Google');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTelegramLogin = async () => {
    setIsLoading(true);
    try {
      await loginWithTelegram();
      toast.success('Успешный вход через Telegram!');
      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      toast.error('Ошибка входа через Telegram');
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="w-full animate-in zoom-in-95 duration-300">
      <div className="rounded-3xl border border-white/5 bg-white/5 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.45)] overflow-hidden">
        <div className="p-10 pb-7 text-center relative">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="absolute left-5 top-5 w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center justify-center text-slate-200"
            aria-label="Вернуться на приветственную страницу"
            title="На главную"
          >
            <i className="fas fa-arrow-left"></i>
          </button>
          <div className="w-14 h-14 rounded-2xl bg-careem-primary mx-auto flex items-center justify-center shadow-lg shadow-[#2D6BFF]/20">
            <i className="fas fa-shield-halved text-white text-xl"></i>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-100">
            {isReset ? 'Новый пароль' : (isLogin ? 'С возвращением' : 'Новый аккаунт')}
          </h2>
          <p className="mt-2 text-sm text-slate-400">Добро пожаловать в БезБарьеров</p>
        </div>

        <div className="px-10 pb-10">
          {!isReset && (
            <div className="rounded-2xl bg-[#0B1220]/50 border border-white/5 p-1 flex gap-1">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className={[
                'flex-1 rounded-xl py-2.5 text-sm font-semibold transition',
                isLogin ? 'bg-careem-primary text-white shadow-md shadow-[#2D6BFF]/20' : 'text-slate-400 hover:text-slate-100'
              ].join(' ')}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className={[
                'flex-1 rounded-xl py-2.5 text-sm font-semibold transition',
                !isLogin ? 'bg-careem-primary text-white shadow-md shadow-[#2D6BFF]/20' : 'text-slate-400 hover:text-slate-100'
              ].join(' ')}
            >
              Новый аккаунт
            </button>
            </div>
          )}

          <form className="mt-7 space-y-5" onSubmit={isReset ? handleSetNewPassword : handleSubmit}>
            {!isLogin && !isReset && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole(UserRole.CUSTOMER)}
                  className={[
                    'rounded-xl py-2.5 text-xs font-semibold transition border',
                    role === UserRole.CUSTOMER
                      ? 'bg-[#13213A] text-slate-100 border-[#1B2D4F]'
                      : 'bg-[#0B1220]/40 text-slate-400 border-white/10 hover:bg-white/5 hover:text-slate-200'
                  ].join(' ')}
                >
                  <i className="fas fa-wheelchair mr-2"></i> Я заказчик
                </button>
                <button
                  type="button"
                  onClick={() => setRole(UserRole.EXECUTOR)}
                  className={[
                    'rounded-xl py-2.5 text-xs font-semibold transition border',
                    role === UserRole.EXECUTOR
                      ? 'bg-[#13213A] text-slate-100 border-[#1B2D4F]'
                      : 'bg-[#0B1220]/40 text-slate-400 border-white/10 hover:bg-white/5 hover:text-slate-200'
                  ].join(' ')}
                >
                  <i className="fas fa-handshake-angle mr-2"></i> Я помощник
                </button>
              </div>
            )}

            {!isLogin && !isReset && (
              <div>
                <label className="block text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-2">Имя</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl bg-[#0B1220]/60 border border-white/10 py-3 px-4 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-careem-primary/60"
                  placeholder="Ваше имя"
                />
              </div>
            )}

            {!isReset && (
              <div>
                <label className="block text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-2">Электронная почта</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl bg-[#0B1220]/60 border border-white/10 py-3 px-4 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-careem-primary/60"
                  placeholder="name@example.com"
                />
              </div>
            )}

            {!isReset ? (
              <div>
                <label className="block text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-2">Пароль</label>
                <div className="relative">
                  <input
                    type={isPasswordVisible ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl bg-[#0B1220]/60 border border-white/10 py-3 pl-4 pr-11 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-careem-primary/60"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible((v) => !v)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-slate-400 hover:text-slate-100 transition"
                    aria-label={isPasswordVisible ? 'Скрыть пароль' : 'Показать пароль'}
                    title={isPasswordVisible ? 'Скрыть пароль' : 'Показать пароль'}
                  >
                    <i className={`fas ${isPasswordVisible ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-2">Новый пароль</label>
                  <div className="relative">
                    <input
                      type={isResetPasswordVisible ? 'text' : 'password'}
                      required
                      value={resetPasswordValue}
                      onChange={(e) => setResetPasswordValue(e.target.value)}
                      className="w-full rounded-xl bg-[#0B1220]/60 border border-white/10 py-3 pl-4 pr-11 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-careem-primary/60"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setIsResetPasswordVisible((v) => !v)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-slate-400 hover:text-slate-100 transition"
                      aria-label={isResetPasswordVisible ? 'Скрыть пароль' : 'Показать пароль'}
                      title={isResetPasswordVisible ? 'Скрыть пароль' : 'Показать пароль'}
                    >
                      <i className={`fas ${isResetPasswordVisible ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-2">Повторите пароль</label>
                  <input
                    type={isResetPasswordVisible ? 'text' : 'password'}
                    required
                    value={resetPasswordConfirm}
                    onChange={(e) => setResetPasswordConfirm(e.target.value)}
                    className="w-full rounded-xl bg-[#0B1220]/60 border border-white/10 py-3 px-4 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-careem-primary/60"
                    placeholder="••••••••"
                  />
                </div>
              </>
            )}

            {!isLogin && !isReset && (
              <div className="flex items-start gap-3">
                <input
                  id="terms"
                  name="terms"
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-[#0B1220]/60 text-careem-primary focus:ring-careem-primary/60"
                />
                <label htmlFor="terms" className="text-xs text-slate-300 leading-relaxed">
                  Я согласен с <Link to="/terms" className="text-careem-primary hover:text-[#255EE6]">условиями публичной оферты</Link>
                </label>
              </div>
            )}

            <button
              disabled={isLoading}
              className="w-full rounded-xl bg-careem-primary hover:bg-[#255EE6] disabled:opacity-60 disabled:hover:bg-careem-primary transition text-white font-semibold py-3.5 shadow-lg shadow-[#2D6BFF]/20 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <i className="fas fa-circle-notch fa-spin"></i>
                  <span>Загрузка...</span>
                </>
              ) : (
                isReset ? 'Сохранить пароль' : (isLogin ? 'Войти в панель' : 'Создать аккаунт')
              )}
            </button>
          </form>

          {isLogin && !isReset && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={isLoading}
                className="text-xs text-slate-400 hover:text-slate-100 transition disabled:opacity-60"
              >
                Забыли пароль?
              </button>
            </div>
          )}

          {!isReset && (
            <div className="mt-8">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10"></div>
              <div className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">или продолжить с</div>
              <div className="h-px flex-1 bg-white/10"></div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={handleTelegramLogin}
                type="button"
                disabled={isLoading}
                className="h-11 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center justify-center disabled:opacity-60"
                title="Telegram"
              >
                <i className="fab fa-telegram-plane text-[#2D6BFF] text-lg"></i>
              </button>
              <button
                onClick={handleGoogleLogin}
                type="button"
                disabled={isLoading}
                className="h-11 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center justify-center disabled:opacity-60"
                title="Google"
              >
                <i className="fab fa-google text-red-400 text-lg"></i>
              </button>
            </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
