import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_USERS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { User, UserRole } from '../types';

const Executors: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [executors, setExecutors] = useState<User[]>([]);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (user.role !== UserRole.CUSTOMER) {
      navigate('/dashboard');
      return;
    }

    const storedUsers = localStorage.getItem('bez_barrierov_users');
    let users: User[] = storedUsers ? JSON.parse(storedUsers) : MOCK_USERS;
    users = users.filter((u) => u.id !== 'u2' && u.id !== 'u3');
    setExecutors(users.filter((u) => u.role === UserRole.EXECUTOR && u.subscriptionStatus !== 'active'));
  }, [navigate, user]);

  const filteredExecutors = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return executors;
    return executors.filter((e) => {
      return (
        e.name.toLowerCase().includes(query) ||
        (e.description || '').toLowerCase().includes(query) ||
        (e.location || '').toLowerCase().includes(query)
      );
    });
  }, [executors, searchTerm]);

  if (!user || user.role !== UserRole.CUSTOMER) return null;

  if (user.subscriptionStatus === 'active') {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 animate-in fade-in duration-300">
        <div className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
          <div className="w-16 h-16 bg-[#13213A] rounded-2xl flex items-center justify-center text-careem-primary border border-[#1B2D4F] mx-auto">
            <i className="fas fa-user-check text-2xl"></i>
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-100 mt-4">У вас уже есть личный помощник</h1>
          <p className="text-sm text-slate-400 mt-2">Список других помощников скрыт, пока подписка активна.</p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/dashboard')}
              className="rounded-2xl bg-careem-primary hover:bg-[#255EE6] transition text-white text-sm font-semibold py-3 px-5 shadow-lg shadow-[#2D6BFF]/20"
            >
              Перейти к заказам
            </button>
            {user.subscribedExecutorId && (
              <button
                onClick={() => navigate(`/users/${user.subscribedExecutorId}`)}
                className="rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-slate-100 text-sm font-semibold py-3 px-5"
              >
                Профиль помощника
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-100">Помощники</h1>
          <p className="text-sm text-slate-400 mt-1">Выберите помощника, откройте профиль и оформите заказ.</p>
        </div>
        <div className="w-full md:w-[360px]">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl px-4 py-3">
            <i className="fas fa-magnifying-glass text-slate-500"></i>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Поиск по имени, городу или описанию"
              className="w-full bg-transparent outline-none text-sm text-slate-200 placeholder:text-slate-500"
            />
          </div>
        </div>
      </div>

      {filteredExecutors.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl p-8 text-center">
          <h2 className="text-lg font-bold text-slate-100">Помощники не найдены</h2>
          <p className="text-sm text-slate-400 mt-2">Попробуйте изменить запрос поиска.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredExecutors.map((executor) => (
            <div
              key={executor.id}
              className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
            >
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <div className="shrink-0">
                    {executor.avatar ? (
                      <img
                        src={executor.avatar}
                        alt={executor.name}
                        className="h-14 w-14 rounded-2xl border border-white/10 object-cover bg-[#13213A] max-w-full"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-2xl border border-white/10 bg-[#13213A] flex items-center justify-center text-careem-primary text-xl font-extrabold">
                        {executor.name.charAt(0)}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-extrabold text-slate-100 truncate">{executor.name}</div>
                        {executor.location && <div className="text-xs text-slate-400 truncate mt-1">{executor.location}</div>}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="inline-flex items-center gap-1 text-xs font-bold text-slate-200">
                          <i className="fas fa-star text-yellow-400"></i>
                          <span>{executor.rating ?? '—'}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          {typeof executor.reviewsCount === 'number' ? `${executor.reviewsCount} отзывов` : ''}
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-slate-300 mt-3 leading-relaxed line-clamp-3">
                      {executor.description || 'Пользователь не указал информацию о себе.'}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => navigate(`/users/${executor.id}`)}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-slate-100 text-sm font-semibold py-2.5"
                  >
                    Профиль
                  </button>
                  <button
                    onClick={() => navigate(`/orders/create?executorId=${executor.id}`)}
                    className="flex-1 rounded-2xl bg-careem-primary hover:bg-[#255EE6] transition text-white text-sm font-semibold py-2.5 shadow-lg shadow-[#2D6BFF]/20"
                  >
                    Заказать
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Executors;
