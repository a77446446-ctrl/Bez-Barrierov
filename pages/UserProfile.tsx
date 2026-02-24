import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { SERVICE_TYPES } from '../constants';
import { Order, OrderStatus, Review, UserRole, User } from '../types';
import { MapContainer, TileLayer, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../context/AuthContext';

interface UserProfileProps {
  onBook?: (userId: string) => void;
}

const MapInvalidator = () => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
};

const UserProfile: React.FC<UserProfileProps> = ({ onBook }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState<User | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [completedOrdersCount, setCompletedOrdersCount] = useState(0);
  const [responsibilityPercent, setResponsibilityPercent] = useState<number | string>(100);
  const [displayRating, setDisplayRating] = useState('5.0');
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

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
    if (!id) {
      setUser(undefined);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    let isActive = true;
    const supabase = getSupabase();
    if (!supabase) {
      setUser(undefined);
      setIsLoading(false);
      return;
    }
    void (async () => {
      try {
        let res = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
        if (
          res.error &&
          (/column profiles\.id does not exist/i.test(res.error.message) ||
            /Could not find the 'id' column of 'profiles' in the schema cache/i.test(res.error.message))
        ) {
          res = await supabase.from('profiles').select('*').eq('user_id', id).maybeSingle();
        }
        const { data, error } = res;
        if (!isActive) return;
        if (error || !data) {
          setUser(undefined);
        } else {
          setUser(profileRowToUser(data));
        }
      } catch (e) {
        if (isActive) setUser(undefined);
      } finally {
        if (isActive) setIsLoading(false);
      }
    })();
    return () => {
      isActive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!user || user.role !== UserRole.EXECUTOR) return;
    const supabase = getSupabase();
    if (!supabase) return;

    let isActive = true;
    void (async () => {
      const { data } = await supabase.from('orders').select('status, rating').eq('executor_id', user.id);
      if (!isActive) return;
      
      const rows = Array.isArray(data) ? data : [];
      
      // 1. Completed Orders Count
      const statuses = rows.map((r: any) => r.status as OrderStatus);
      const completed = statuses.filter((s) => s === OrderStatus.COMPLETED).length;
      setCompletedOrdersCount(completed);

      // 2. Responsibility Percent
      const finished = statuses.filter((s) => s === OrderStatus.COMPLETED || s === OrderStatus.CANCELLED || s === OrderStatus.REJECTED).length;
      const percent = finished > 0 ? Math.round((completed / finished) * 100) : 0;
      
      // Show "......." if no finished orders or responsibility is less than 80%
      // As per user request: "пока нет оценок просто ....... а уже когда наберется 80 % то тогда можно вывести в этот блок"
      if (finished === 0 || percent < 80) {
        setResponsibilityPercent('.......' as any);
      } else {
        setResponsibilityPercent(percent);
      }

      // 3. Real Rating Calculation from Orders
      const ratings = rows
        .filter((r: any) => typeof r.rating === 'number' && r.rating > 0)
        .map((r: any) => r.rating);
      
      if (ratings.length > 0) {
        const total = ratings.reduce((sum: number, r: number) => sum + r, 0);
        const avg = total / ratings.length;
        setDisplayRating(avg.toFixed(1));
      } else {
        setDisplayRating('0.0'); // No ratings yet
      }
    })();
    return () => {
      isActive = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== UserRole.EXECUTOR || !currentUser) {
      setHasPendingRequest(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setHasPendingRequest(false);
      return;
    }

    let isActive = true;
    void (async () => {
      const { data } = await supabase
        .from('orders')
        .select('status')
        .eq('executor_id', user.id)
        .eq('customer_id', currentUser.id);
      if (!isActive) return;

      const rows = Array.isArray(data) ? data as any[] : [];
      const hasActive = rows.some(
        (r: any) =>
          r.status !== OrderStatus.COMPLETED &&
          r.status !== OrderStatus.CANCELLED &&
          r.status !== OrderStatus.REJECTED
      );
      setHasPendingRequest(hasActive);
    })();

    return () => {
      isActive = false;
    };
  }, [user, currentUser]);

  if (isLoading) {
    const passedName = location.state?.name;
    return (
      <div className="py-20 px-4">
        <div className="max-w-xl mx-auto text-center bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
          <div className="flex justify-center mb-6">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-careem-primary border-t-transparent"></div>
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">
            {passedName ? `Подождите, идет загрузка профиля ${passedName}...` : 'Подождите, идет загрузка профиля...'}
          </h2>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="py-20 px-4">
        <div className="max-w-xl mx-auto text-center bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
          <h2 className="text-2xl font-extrabold text-slate-100 mb-2">Пользователь не найден</h2>
          <p className="text-slate-300 mb-6">Возможно, профиль был удален или ссылка неверна.</p>
          <button 
            onClick={() => navigate('/')}
            className="text-careem-primary hover:text-white font-semibold"
          >
            Вернуться на главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Profile Header */}
        <div className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
          <div className="h-28 sm:h-32 w-full bg-gradient-to-r from-[#2D6BFF]/35 via-[#13213A] to-[#0B1220]"></div>
          <div className="px-6 pb-6 sm:px-8 sm:pb-8">
            <div className="-mt-12 sm:-mt-16 flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="shrink-0">
                {user.avatar ? (
                  <img 
                    src={user.avatar} 
                    alt={user.name} 
                    className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl border border-white/10 object-cover bg-[#13213A] max-w-full shadow-lg"
                  />
                ) : (
                  <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl border border-white/10 bg-[#13213A] flex items-center justify-center text-careem-primary text-3xl font-extrabold shadow-lg">
                    {user.name.charAt(0)}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 truncate">{user.name}</h1>
                  {user.role === UserRole.EXECUTOR ? (
                    <span className="bg-[#13213A] text-slate-200 text-xs px-2.5 py-1 rounded-full border border-[#1B2D4F] font-semibold">Помощник</span>
                  ) : (
                    <span className="bg-[#13213A] text-slate-200 text-xs px-2.5 py-1 rounded-full border border-[#1B2D4F] font-semibold">Заказчик</span>
                  )}
                </div>
                {user.location && (
                  <p className="text-sm text-slate-400 flex items-center mt-2">
                    <i className="fas fa-map-marker-alt mr-2 text-careem-primary"></i> 
                    <span className="truncate">{user.location}</span>
                  </p>
                )}
              </div>
              
              {user.role === UserRole.EXECUTOR && (
                <div className="sm:ml-auto">
                  <button
                    onClick={() => {
                      if (!hasPendingRequest) {
                        onBook ? onBook(user.id) : navigate(`/orders/create?executorId=${user.id}`);
                      }
                    }}
                    disabled={hasPendingRequest}
                    className="w-full sm:w-auto px-5 py-3 rounded-2xl text-sm font-semibold text-white bg-careem-primary hover:bg-[#255EE6] transition shadow-lg shadow-[#2D6BFF]/20 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-careem-primary"
                  >
                    {hasPendingRequest ? 'Вы оставили помощнику заявку' : 'Заказать услугу'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Profile Content */}
        <div className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl p-6 sm:p-8 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
          <h3 className="text-lg font-bold text-slate-100 mb-4">О себе</h3>
          <p className="text-slate-300 leading-relaxed">
            {user.description || "Пользователь не указал информацию о себе."}
          </p>
        </div>

        {/* Coverage Map */}
        {user.role === UserRole.EXECUTOR && user.locationCoordinates && (
          <div className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl p-6 sm:p-8 shadow-[0_18px_60px_rgba(0,0,0,0.35)] animate-in fade-in duration-500">
            <h3 className="text-lg font-bold text-slate-100 mb-4">Зона работы</h3>
            <div className="h-64 rounded-2xl overflow-hidden border border-white/10 z-0 relative">
                 <MapContainer 
                   center={[user.locationCoordinates.lat, user.locationCoordinates.lng]} 
                   zoom={11}
                   style={{ height: '100%', width: '100%' }}
                 >
                   <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            keepBuffer={4}
          />
          <MapInvalidator />
                   <Circle 
                     center={[user.locationCoordinates.lat, user.locationCoordinates.lng]} 
                     radius={(user.coverageRadius || 5) * 1000}
                     pathOptions={{ fillColor: '#2D6BFF', color: '#2D6BFF', fillOpacity: 0.18, weight: 2 }} 
                   />
                 </MapContainer>
            </div>
            <p className="text-sm text-slate-400 mt-4 flex items-start gap-2">
              <i className="fas fa-info-circle mt-0.5 text-careem-primary"></i>
              <span>Помощник работает в радиусе <strong className="text-slate-200">{user.coverageRadius || 5} км</strong> от своего местоположения. Точный адрес скрыт в целях безопасности.</span>
            </p>
          </div>
        )}

        {/* Services & Tariffs */}
        {user.role === UserRole.EXECUTOR && user.customServices && user.customServices.length > 0 && (
          <div className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl p-6 sm:p-8 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
            <h3 className="text-lg font-bold text-slate-100 mb-4">Услуги и цены</h3>
            <div className="space-y-3">
              {user.customServices.filter(s => s.enabled).map(service => {
                const serviceInfo = SERVICE_TYPES.find(st => st.id === service.serviceId);
                if (!serviceInfo) return null;
                return (
                  <div key={service.serviceId} className="flex justify-between items-center border-b border-white/10 pb-2 last:border-0 last:pb-0 gap-4">
                    <span className="text-slate-200">{serviceInfo.name}</span>
                    <span className="font-extrabold text-careem-primary whitespace-nowrap">{service.price} ₽/час</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Contact Info (if needed/allowed) */}
        {user.role === UserRole.EXECUTOR && (
          <div className="space-y-6">
            {/* Vehicle Photo */}
            {user.vehiclePhoto && (
              <div className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl p-6 sm:p-8 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
                <h3 className="text-lg font-bold text-slate-100 mb-4">Фото транспорта</h3>
                <div className="rounded-2xl overflow-hidden w-full bg-white/5 border border-white/10 flex justify-center">
                  <img 
                    src={user.vehiclePhoto} 
                    alt="Транспорт" 
                    className="max-w-full h-auto max-h-[80vh] object-contain hover:scale-105 transition duration-500"
                  />
                </div>
              </div>
            )}

            <div className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl p-6 sm:p-8 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
              <h3 className="text-lg font-bold text-slate-100 mb-4">Статистика</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                  <div className="text-2xl font-extrabold text-careem-primary">{displayRating}</div>
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Рейтинг</div>
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                  <div className="text-2xl font-extrabold text-careem-primary">{completedOrdersCount}</div>
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Выполнено заказов</div>
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                  <div className="text-2xl font-extrabold text-careem-primary">
                    {responsibilityPercent === '.......' ? '.......' : `${responsibilityPercent}%`}
                  </div>
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Ответственность</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfile;
