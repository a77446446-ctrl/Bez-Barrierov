import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, UserRole, OrderStatus } from '../types';
import { createClient } from '@supabase/supabase-js';

const Executors: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [executors, setExecutors] = useState<User[]>([]);
  const [blockedExecutorIds, setBlockedExecutorIds] = useState<string[]>([]);
  const [realRatings, setRealRatings] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProfileId, setLoadingProfileId] = useState<string | null>(null);

  useEffect(() => {
    const fetchRealRatings = async () => {
      const supabase = getSupabase();
      if (!supabase) return;
      
      const { data } = await supabase
        .from('orders')
        .select('executor_id, rating')
        .not('rating', 'is', null)
        .gt('rating', 0);

      if (data) {
        const ratingsMap: Record<string, number[]> = {};
        data.forEach((row: any) => {
          if (row.executor_id) {
            if (!ratingsMap[row.executor_id]) ratingsMap[row.executor_id] = [];
            ratingsMap[row.executor_id].push(row.rating);
          }
        });

        const averages: Record<string, string> = {};
        Object.keys(ratingsMap).forEach(id => {
          const ratings = ratingsMap[id];
          const sum = ratings.reduce((a, b) => a + b, 0);
          averages[id] = (sum / ratings.length).toFixed(1);
        });
        setRealRatings(averages);
      }
    };
    
    fetchRealRatings();
  }, []);

  const getSupabase = () => {
    const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
    const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) return null;
    return createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  };

  const profileRowToUser = (row: any): User => {
    return {
      id: row.id ?? row.user_id ?? row.userId,
      role: row.role,
      name: row.name || '',
      email: row.email || '',
      phone: row.phone || '',
      telegramId: row.telegram_id ?? row.telegramId,
      avatar: row.avatar ?? row.avatar_url,
      rating: row.rating ?? undefined,
      reviewsCount: row.reviews_count ?? row.reviewsCount,
      reviews: row.reviews ?? undefined,
      location: row.location ?? undefined,
      locationCoordinates: row.location_coordinates ?? row.locationCoordinates,
      coverageRadius: row.coverage_radius ?? row.coverageRadius,
      description: row.description ?? undefined,
      profileVerificationStatus: row.profile_verification_status ?? row.profileVerificationStatus,
      vehiclePhoto: row.vehicle_photo ?? row.vehiclePhoto,
      customServices: row.custom_services ?? row.customServices,
      subscriptionStatus: row.subscription_status ?? row.subscriptionStatus,
      subscriptionStartDate: row.subscription_start_date ?? row.subscriptionStartDate,
      subscriptionEndDate: row.subscription_end_date ?? row.subscriptionEndDate,
      subscribedToCustomerId: row.subscribed_to_customer_id ?? row.subscribedToCustomerId,
      subscriptionRequestToCustomerId: row.subscription_request_to_customer_id ?? row.subscriptionRequestToCustomerId,
      subscribedExecutorId: row.subscribed_executor_id ?? row.subscribedExecutorId,
      notifications: row.notifications ?? undefined
    };
  };

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (user.role !== UserRole.CUSTOMER) {
      navigate('/dashboard');
      return;
    }
    
    setIsLoading(true);
    
    let isActive = true;
    const timeoutId = setTimeout(() => {
      if (isActive) {
        setIsLoading(false);
        console.warn('Executors loading timed out');
      }
    }, 15000);

    const supabase = getSupabase();
    if (!supabase) {
      setIsLoading(false);
      clearTimeout(timeoutId);
      return;
    }

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', UserRole.EXECUTOR)
          .neq('subscription_status', 'active');
        
        if (!isActive) return;

        // Fetch busy executors (those with active CONFIRMED orders)
        const { data: busyOrders } = await supabase
          .from('orders')
          .select('executor_id')
          .eq('status', OrderStatus.CONFIRMED);
          
        const busyExecutorIds = new Set(busyOrders?.map((o: any) => o.executor_id).filter(Boolean) || []);
        
        if (error || !Array.isArray(data)) {
          setExecutors([]);
        } else {
          setExecutors(data.map(profileRowToUser).filter(u => !busyExecutorIds.has(u.id)));
        }

        if (!user) {
          setBlockedExecutorIds([]);
          setIsLoading(false);
          clearTimeout(timeoutId);
          return;
        }

        const { data: ordersData } = await supabase
          .from('orders')
          .select('executor_id, status')
          .eq('customer_id', user.id);

        if (!isActive) return;

        if (!Array.isArray(ordersData)) {
          setBlockedExecutorIds([]);
        } else {
          // We no longer block executors who have confirmed orders.
          // All executors should be visible unless they are blocked for other reasons (not implemented yet).
          setBlockedExecutorIds([]);
        }
      } catch (e) {
        console.error('Error loading executors:', e);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [navigate, user?.id, user?.role]);

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

      {isLoading ? (
        <div className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl p-8 text-center animate-in fade-in duration-300">
          <div className="flex justify-center mb-4">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-careem-primary border-t-transparent"></div>
          </div>
          <h2 className="text-lg font-bold text-slate-100">Подождите, идет подбор специалистов...</h2>
        </div>
      ) : filteredExecutors.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl p-8 text-center animate-in fade-in duration-300">
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
                          <span>{realRatings[executor.id] || '0.0'}</span>
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
                    onClick={() => {
                      setLoadingProfileId(executor.id);
                      setTimeout(() => navigate(`/users/${executor.id}`, { state: { name: executor.name } }), 50);
                    }}
                    disabled={loadingProfileId === executor.id}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-slate-100 text-sm font-semibold py-2.5 flex items-center justify-center gap-2"
                  >
                    {loadingProfileId === executor.id ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-slate-400">Подождите, идет загрузка...</span>
                      </>
                    ) : (
                      'Профиль'
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (!blockedExecutorIds.includes(executor.id)) {
                        navigate(`/orders/create?executorId=${executor.id}`);
                      }
                    }}
                    disabled={blockedExecutorIds.includes(executor.id)}
                    className="flex-1 rounded-2xl bg-careem-primary hover:bg-[#255EE6] transition text-white text-sm font-semibold py-2.5 shadow-lg shadow-[#2D6BFF]/20 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-careem-primary"
                  >
                    {blockedExecutorIds.includes(executor.id) ? 'Вы оставили помощнику заявку' : 'Заказать'}
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
