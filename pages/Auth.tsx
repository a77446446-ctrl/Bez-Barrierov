import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { UserRole } from '../types';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

interface AuthProps {
  onSuccess?: () => void;
}

const Auth: React.FC<AuthProps> = ({ onSuccess }) => {
  const { login, register, loginWithGoogle } = useAuth();
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(() => {
    return searchParams.get('mode') !== 'register';
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.CUSTOMER);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const mode = searchParams.get('mode');
    const roleParam = searchParams.get('role');

    if (mode === 'register') {
      setIsLogin(false);
    } else if (mode === 'login') {
      setIsLogin(true);
    }

    if (roleParam === 'EXECUTOR') {
      setRole(UserRole.EXECUTOR);
    } else if (roleParam === 'CUSTOMER') {
      setRole(UserRole.CUSTOMER);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      if (onSuccess) {
        onSuccess();
      } else {
        // Redirect to dashboard immediately if no custom handler is provided
        window.location.href = '/dashboard';
      }
    } catch (error: any) {
      toast.error(error.message || 'Произошла ошибка');
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
        window.location.href = '/dashboard';
      }
    } catch (error) {
      toast.error('Ошибка входа через Google');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50 py-12">
      <div className="max-w-md w-full animate-in zoom-in-95 duration-300">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-8 pb-0">
            <div className="w-12 h-12 bg-careem-primary text-white rounded-xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-100">
              <i className="fas fa-key text-xl"></i>
            </div>
            <h2 className="text-3xl font-black text-center text-gray-900 mb-2">{isLogin ? 'С возвращением!' : 'Присоединяйтесь'}</h2>
            <p className="text-center text-gray-500 text-sm mb-8">
              {isLogin ? 'Войдите в систему, чтобы управлять заказами' : 'Создайте аккаунт для доступа к сервису'}
            </p>
          </div>

          <div className="px-8 pb-8">
            <form className="space-y-4" onSubmit={handleSubmit}>
              {!isLogin && (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setRole(UserRole.CUSTOMER)}
                      className={`py-2 px-4 text-xs font-bold rounded-lg border-2 transition ${role === UserRole.CUSTOMER ? 'border-careem-primary bg-green-50 text-careem-primary' : 'border-gray-100 text-gray-400'}`}
                    >
                      Я заказчик
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole(UserRole.EXECUTOR)}
                      className={`py-2 px-4 text-xs font-bold rounded-lg border-2 transition ${role === UserRole.EXECUTOR ? 'border-careem-primary bg-green-50 text-careem-primary' : 'border-gray-100 text-gray-400'}`}
                    >
                      Я помощник
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Имя</label>
                    <div className="relative">
                      <i className="fas fa-user absolute left-4 top-3.5 text-gray-300"></i>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-gray-50 border-gray-100 rounded-xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-careem-primary focus:outline-none"
                        placeholder="Ваше имя"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Email</label>
                <div className="relative">
                  <i className="fas fa-envelope absolute left-4 top-3.5 text-gray-300"></i>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-gray-50 border-gray-100 rounded-xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-careem-primary focus:outline-none"
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Пароль</label>
                <div className="relative">
                  <i className="fas fa-lock absolute left-4 top-3.5 text-gray-300"></i>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-50 border-gray-100 rounded-xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-careem-primary focus:outline-none"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {!isLogin && (
                <div className="flex items-start">
                  <div className="flex items-center h-5">
                    <input
                      id="terms"
                      name="terms"
                      type="checkbox"
                      required
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="focus:ring-careem-primary h-4 w-4 text-careem-primary border-gray-300 rounded"
                    />
                  </div>
                  <div className="ml-3 text-xs">
                    <label htmlFor="terms" className="font-medium text-gray-700">
                      Я согласен с <Link to="/terms" className="text-careem-primary hover:text-green-700">условиями публичной оферты</Link>
                    </label>
                  </div>
                </div>
              )}

              <button className="w-full bg-careem-primary hover:bg-green-700 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-green-100 mt-4">
                {isLogin ? 'Войти' : 'Создать аккаунт'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-careem-primary hover:text-green-800 font-medium"
              >
                {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
              </button>
            </div>

            <div className="mt-8 pt-8 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400 mb-4">Или войти через</p>
              <div className="flex justify-center gap-4">
                <button className="w-10 h-10 bg-white border border-gray-100 rounded-lg flex items-center justify-center text-[#24A1DE] hover:bg-gray-50 transition"><i className="fab fa-telegram-plane"></i></button>
                <button onClick={handleGoogleLogin} type="button" className="w-10 h-10 bg-white border border-gray-100 rounded-lg flex items-center justify-center text-red-500 hover:bg-gray-50 transition"><i className="fab fa-google"></i></button>
              </div>
            </div>
          </div>
        </div>
        {!isLogin && (
          <p className="mt-8 text-center text-[10px] text-gray-400 leading-relaxed px-4">
            Регистрируясь, вы подтверждаете свое согласие с <Link to="/terms" className="underline hover:text-gray-500">публичной офертой</Link> и правилами обработки персональных данных.
          </p>
        )}
      </div>
    </div>
  );
};

export default Auth;