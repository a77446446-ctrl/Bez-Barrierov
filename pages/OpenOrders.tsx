import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, UserRole, Order, OrderStatus } from '../types';
import { SERVICE_TYPES } from '../constants';
import OrderMap from '../components/OrderMap';
import { createClient } from '@supabase/supabase-js';

const getOrderDateTimeMs = (order: Order) => {
  if (!order.date || !order.time) return null;
  const [hoursRaw, minutesRaw] = order.time.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const base = new Date(`${order.date}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  base.setHours(hours, minutes, 0, 0);
  return base.getTime();
};

const cleanupExpiredOpenOrders = (orderList: Order[]) => {
  // Allow expired orders to be visible for now
  return orderList;
  /*
  const now = Date.now();
  return orderList.filter((o) => {
    if (o.status !== OrderStatus.OPEN) return true;
    const dt = getOrderDateTimeMs(o);
    if (dt === null) return true;
    return dt > now;
  });
  */
};

const orderRowToOrder = (row: any): Order => {
  return {
    id: row.id,
    customerId: row.customer_id,
    executorId: row.executor_id ?? undefined,
    serviceType: row.service_type,
    date: row.date,
    time: row.time,
    status: row.status,
    totalPrice: row.total_price,
    details: row.details ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    allowOpenSelection: row.allow_open_selection ?? undefined,
    responses: Array.isArray(row.responses) ? row.responses.map((x: any) => String(x)) : [],
    voiceMessageUrl: row.voice_message_url ?? undefined,
    rating: row.rating ?? undefined,
    review: row.review ?? undefined,
    locationFrom: row.location_from ?? undefined,
    locationTo: row.location_to ?? undefined,
    generalLocation: row.general_location ?? undefined
  };
};

const formatAddress = (address?: string) => {
  if (!address) return 'Адрес не указан';
  return address
    .replace(/, \d{6}/, '')
    .replace(/, Россия$/, '')
    .replace(/^Россия, /, '')
    .replace(/Россия, /, '');
};

const getServiceHeaderInfo = (serviceType: string) => {
  const service = SERVICE_TYPES.find(st => st.name === serviceType);
  if (!service || !service.headerImage) return null;
  return { image: service.headerImage, color: service.headerColor || 'transparent' };
};

const OpenOrders: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [hasActiveOrder, setHasActiveOrder] = useState(false);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);

  const [allUsers, setAllUsers] = useState<User[]>([]);

  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);
  useEffect(() => {
    const evt = new CustomEvent(selectedOrderDetails ? 'global-modal-open' : 'global-modal-close');
    window.dispatchEvent(evt);
  }, [selectedOrderDetails]);

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
    if (user.role !== UserRole.EXECUTOR) {
      navigate('/dashboard');
      return;
    }
  }, [navigate, user]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setIsLoadingOrders(false);
      return;
    }
    let isActive = true;
    let stopPolling = false;

    const loadOpenOrders = async (signal?: AbortSignal) => {
      if (stopPolling) return;
      try {
      // 1. Check subscription status first
      // If subscription is pending or active, hide ALL open orders
      if (user?.subscriptionStatus === 'pending' || user?.subscriptionStatus === 'active') {
        setHasActiveOrder(true); // Treat as "active" to show the status message instead of "No orders"
        setOrders([]);
        setIsLoadingOrders(false);
        return;
      }

      // 2. Check if executor has any active confirmed orders
      const { data: activeOrders, error: activeOrdersError } = await supabase
        .from('orders')
        .select('id')
        .eq('executor_id', user.id)
        .eq('status', OrderStatus.CONFIRMED)
        .limit(1)
        .abortSignal(signal || new AbortController().signal);

      if (activeOrdersError) {
        throw activeOrdersError;
      }

      if (activeOrders && activeOrders.length > 0) {
        setHasActiveOrder(true);
        setOrders([]);
        setIsLoadingOrders(false);
        return;
      } else {
        setHasActiveOrder(false);
      }

      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('status', OrderStatus.OPEN)
        .order('created_at', { ascending: false })
        .abortSignal(signal || new AbortController().signal);

      if (ordersError) {
        throw ordersError;
      }

      if (!isActive) return;
      const loaded = Array.isArray(ordersData) ? ordersData.map(orderRowToOrder) : [];
      const cleaned = cleanupExpiredOpenOrders(loaded);
      setOrders(cleaned);

      const ids = Array.from(new Set(cleaned.map((o) => o.customerId).filter(Boolean)));
      if (ids.length === 0) {
        setAllUsers([]);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('id', ids)
        .abortSignal(signal || new AbortController().signal);
        
      if (!isActive) return;
      if (error || !Array.isArray(data)) {
        if (error) throw error;
        setAllUsers([]);
        return;
      }
      setAllUsers(data.map(profileRowToUser));
      setIsLoadingOrders(false);
      } catch (err: any) {
        const isAbort = err.name === 'AbortError' || 
                       (err.message && err.message.includes('AbortError')) ||
                       (err.details && err.details.includes('AbortError'));
        
        if (!isAbort) {
          console.error('Error loading open orders:', err);
          stopPolling = true;
          if (!isActive) return;
          setOrders([]);
          setAllUsers([]);
          setHasActiveOrder(false);
          setIsLoadingOrders(false);
        }
      }
    };

    const controller = new AbortController();
    void loadOpenOrders(controller.signal);
    const intervalId = window.setInterval(() => void loadOpenOrders(controller.signal), 5000);

    return () => {
      isActive = false;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [user?.id, user?.role]);

  const openOrders = useMemo(() => {
    if (!user || user.role !== UserRole.EXECUTOR) return [];
    return orders.filter((o) => o.status === OrderStatus.OPEN);
  }, [orders, user]);

  const handleTakeOpenOrder = async (orderId: string) => {
    if (!user) return;
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase
      .from('orders')
      .update({ status: OrderStatus.CONFIRMED, executor_id: user.id, responses: [] })
      .eq('id', orderId);
    navigate('/dashboard');
  };

  if (!user || user.role !== UserRole.EXECUTOR) return null;

  const isProfileFullyFilled = useMemo(() => {
    if (!user) return false;
    const hasName = !!user.name && user.name.trim().length > 0;
    const hasPhone = !!user.phone && user.phone.trim().length > 0;
    const hasLocation = !!user.locationCoordinates;
    const hasRadius = (user.coverageRadius || 0) > 0;
    const hasServices = user.customServices && user.customServices.some(s => s.enabled);
    const hasDescription = !!user.description && user.description.trim().length > 0;
    return hasName && hasPhone && hasLocation && hasRadius && hasServices && hasDescription;
  }, [user]);

  const isProfileReadyForWork = isProfileFullyFilled && user.profileVerificationStatus === 'verified';

  if (!isProfileReadyForWork) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 animate-in fade-in duration-300">
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-8 text-center shadow-lg">
          <div className="w-20 h-20 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="fas fa-user-shield text-3xl"></i>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Требуется верификация</h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            {!isProfileFullyFilled 
              ? "Чтобы видеть доступные заказы и начать работу, пожалуйста, полностью заполните свой профиль (имя, телефон, описание, местоположение и услуги)."
              : "Ваш профиль находится на проверке. Дождитесь подтверждения администратором, чтобы получить доступ к заказам."}
          </p>
          {!isProfileFullyFilled && (
            <button
              onClick={() => navigate('/dashboard?tab=profile')}
              className="bg-careem-primary/80 text-white font-bold py-3 px-8 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-200"
            >
              Перейти к профилю
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-100 truncate">Свободные заказы</h1>
          <p className="text-sm text-slate-400 mt-1">Здесь собраны все заказы со статусом «Свободен».</p>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="shrink-0 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-slate-100 text-sm font-semibold py-2.5 px-4"
        >
          Назад
        </button>
      </div>

      {hasActiveOrder ? (
        <div className="bg-[#0B1220]/80 border border-careem-primary/30 p-6 rounded-3xl mb-6 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-careem-primary/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
          <div className="relative z-10 flex items-start gap-4">
            <div className="w-12 h-12 bg-careem-primary/20 rounded-2xl flex items-center justify-center text-careem-primary border border-careem-primary/30 shrink-0">
              <i className="fas fa-tasks text-xl"></i>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 mb-2">
                {user?.subscriptionStatus === 'active' 
                  ? 'Активная подписка'
                  : user?.subscriptionStatus === 'pending'
                  ? 'Ожидание подтверждения подписки'
                  : 'У вас активный заказ'}
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed mb-3">
                {user?.subscriptionStatus === 'active'
                  ? 'Вы работаете с постоянным заказчиком в рамках подписки. В этот период доступ к общей ленте свободных заказов ограничен, чтобы вы могли сосредоточиться на текущих задачах.'
                  : user?.subscriptionStatus === 'pending'
                  ? 'Ваш запрос на подписку отправлен и ожидает подтверждения от заказчика. Как только он примет решение, вы получите уведомление. До этого момента доступ к новым заказам временно приостановлен.'
                  : 'Вы уже взяли заказ в работу. Новые заказы станут доступны для просмотра после того, как вы завершите текущее задание.'}
              </p>
            </div>
          </div>
        </div>
      ) : openOrders.length === 0 ? (
        isLoadingOrders ? (
          <div className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-careem-primary shadow-lg">
              <i className="fas fa-spinner text-white text-xl animate-spin"></i>
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-100">Подождите немного — идёт обновление заказов</h2>
            <p className="text-sm text-slate-400 mt-2">Лента синхронизируется автоматически в реальном времени.</p>
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl p-8 text-center">
            <h2 className="text-lg font-bold text-slate-100">Свободных заказов нет</h2>
            <p className="text-sm text-slate-400 mt-2">Проверьте позже — новые заказы появляются автоматически.</p>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {openOrders.map((order) => {
            const customer = allUsers.find((u) => u.id === order.customerId);
            return (
              <div
                key={order.id}
                className="rounded-3xl border border-careem-dark/50 bg-gradient-to-br from-careem-dark to-[#003822] backdrop-blur-xl overflow-hidden shadow-xl group relative text-white"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-green-400/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-careem-accent/10 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none"></div>
                <i className="fas fa-hand-holding-heart absolute -bottom-6 -right-6 text-[9rem] opacity-5 transform rotate-12 group-hover:rotate-0 group-hover:scale-110 transition duration-700 ease-out pointer-events-none"></i>
                {(() => {
                  const info = getServiceHeaderInfo(order.serviceType);
                  return info && (
                    <div
                      className="absolute inset-x-0 top-0 h-32 pointer-events-none"
                      style={{
                        backgroundColor: info.color,
                        backgroundImage: `url(${info.image})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
                        filter: 'brightness(0.8)'
                      }}
                    />
                  );
                })()}
                <div className="p-5 relative z-10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold drop-shadow-md">Заказ: ({order.id.split('-')[0]})</div>
                      <div className="mt-1 text-lg font-extrabold text-slate-100 truncate drop-shadow-md">{order.serviceType}</div>
                      <div className="mt-2 flex flex-col items-start sm:flex-row sm:flex-wrap sm:items-center gap-2 text-xs text-slate-300 drop-shadow-sm">
                        {order.date && (
                          <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
                            <i className="fas fa-calendar-alt text-slate-400"></i>
                            {order.date}
                          </span>
                        )}
                        {order.time && (
                          <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
                            <i className="fas fa-clock text-slate-400"></i>
                            {order.time}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
                          <i className="fas fa-ruble-sign text-slate-400"></i>
                          {order.totalPrice} ₽
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 inline-flex items-center gap-2 rounded-2xl border border-careem-primary/25 bg-careem-primary/10 text-careem-primary px-3 py-2 text-xs font-bold">
                      <i className="fas fa-circle text-[8px]"></i>
                      Свободен
                    </div>
                  </div>

                  {order.details && (
                    <p className="mt-4 text-[11px] md:text-sm text-slate-300 leading-relaxed break-words">{order.details}</p>
                  )}

                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Заказчик</div>
                    {customer ? (
                      <div className="mt-3 flex items-center gap-3">
                        <img
                          src={customer.avatar || `https://ui-avatars.com/api/?name=${customer.name}`}
                          alt={customer.name}
                          className="h-10 w-10 rounded-2xl border border-white/10 object-cover bg-[#13213A] max-w-full"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-slate-100 truncate">{customer.name}</div>
                          <div className="text-xs text-slate-400 truncate">{customer.location || 'Город не указан'}</div>
                        </div>
                        <button
                          onClick={() => navigate(`/users/${customer.id}`)}
                          className="shrink-0 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-slate-100 text-xs font-semibold py-2 px-3"
                        >
                          Профиль
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-slate-400">Пользователь не найден</div>
                    )}
                  </div>

                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => handleTakeOpenOrder(order.id)}
                      className="flex-1 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-xl border border-white/20 text-white text-sm font-bold py-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),inset_0_-4px_8px_rgba(0,0,0,0.2),0_10px_30px_rgba(0,0,0,0.3)] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.5),inset_0_-4px_8px_rgba(0,0,0,0.2),0_15px_35px_rgba(45,107,255,0.3)] transition-all duration-300 transform hover:-translate-y-0.5"
                    >
                      Взять в работу
                    </button>
                    <button
                      onClick={() => setSelectedOrderDetails(order)}
                      className="flex-1 rounded-2xl bg-[#334155] hover:bg-[#475569] transition text-white text-sm font-semibold py-3 shadow-lg shadow-slate-900/20"
                    >
                      Подробнее
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedOrderDetails && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedOrderDetails(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <div className="min-w-0">
                <h3 className="text-xl font-bold text-gray-900">Подробнее о заказе</h3>
                <p className="text-sm text-gray-500 mt-1 truncate">{selectedOrderDetails.serviceType}</p>
              </div>
              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition shadow-sm"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div>
                  <p className="text-xs text-careem-primary font-bold uppercase mb-1">Стоимость</p>
                  <p className="text-2xl font-bold text-careem-dark">{selectedOrderDetails.totalPrice} ₽</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-careem-primary font-bold uppercase mb-1">Статус</p>
                  <span className="text-[11px] leading-none font-black uppercase tracking-wide whitespace-nowrap text-careem-primary">
                    Свободен
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-400 font-bold uppercase mb-1">Дата</p>
                  <p className="font-bold text-gray-900 flex items-center gap-2">
                    <i className="fas fa-calendar-alt text-careem-primary"></i>
                    {selectedOrderDetails.date || 'Не указана'}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-400 font-bold uppercase mb-1">Время</p>
                  <p className="font-bold text-gray-900 flex items-center gap-2">
                    <i className="fas fa-clock text-careem-primary"></i>
                    {selectedOrderDetails.time || 'Не указано'}
                  </p>
                </div>
              </div>

              {(() => {
                const customer = allUsers.find((u) => u.id === selectedOrderDetails.customerId);
                if (!customer) return null;
                return (
                  <div className="mb-6">
                    <h4 className="text-sm font-bold text-gray-900 mb-2">Заказчик</h4>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center gap-3">
                      <img
                        src={customer.avatar || `https://ui-avatars.com/api/?name=${customer.name}`}
                        alt={customer.name}
                        className="h-10 w-10 rounded-2xl border border-gray-200 object-cover bg-white max-w-full"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-gray-900 truncate">{customer.name}</div>
                        <div className="text-xs text-gray-500 truncate">{customer.location || 'Город не указан'}</div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedOrderDetails(null);
                          navigate(`/users/${customer.id}`);
                        }}
                        className="shrink-0 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 transition text-gray-900 text-xs font-semibold py-2 px-3"
                      >
                        Профиль
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div className="mb-6">
                 <h4 className="text-sm font-bold text-gray-900 mb-2">Описание задачи</h4>
                 <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-gray-700 text-sm leading-relaxed">
                   {selectedOrderDetails.details ? selectedOrderDetails.details : 'Описание отсутствует'}
                 </div>
              </div>

              {selectedOrderDetails.voiceMessageUrl && (
                <div className="mb-6">
                  <h4 className="text-sm font-bold text-gray-900 mb-2">Голосовое сообщение</h4>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <audio src={selectedOrderDetails.voiceMessageUrl} controls className="w-full h-10" />
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h4 className="text-sm font-bold text-gray-900 mb-2">Маршрут и адрес</h4>
                
                {selectedOrderDetails.locationFrom && selectedOrderDetails.locationTo ? (
                  <>
                    <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center shrink-0 border border-green-600 shadow-sm">
                          <span className="font-bold text-green-600 text-xs">A</span>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase text-gray-400 mb-1">Откуда</p>
                          <p className="text-gray-800 leading-tight">
                            {formatAddress(selectedOrderDetails.locationFrom.address)}
                          </p>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0 border border-red-600 shadow-sm">
                          <span className="font-bold text-red-600 text-xs">B</span>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase text-gray-400 mb-1">Куда</p>
                          <p className="text-gray-800 leading-tight">
                            {formatAddress(selectedOrderDetails.locationTo.address)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="h-64 w-full rounded-2xl overflow-hidden border border-gray-200">
                      <OrderMap order={selectedOrderDetails} hideInfo />
                    </div>
                  </>
                ) : selectedOrderDetails.generalLocation ? (
                   <>
                     <div className="mb-3 bg-gray-50 rounded-xl border border-gray-100 p-3 text-sm flex items-start gap-3">
                       <i className="fas fa-map-marker-alt text-red-500 mt-1 shrink-0 text-lg"></i>
                       <div>
                         <p className="text-[11px] font-bold uppercase text-gray-400 mb-1">Адрес</p>
                         <p className="text-gray-800">
                           {formatAddress(selectedOrderDetails.generalLocation.address)}
                         </p>
                       </div>
                     </div>
                     <div className="h-64 w-full rounded-2xl overflow-hidden border border-gray-200">
                       <OrderMap order={selectedOrderDetails} hideInfo />
                     </div>
                   </>
                ) : (
                  <p className="text-sm text-gray-400 italic">Адрес уточняется у заказчика</p>
                )}
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-100 bg-gray-50 shrink-0">
               <button
                  onClick={() => {
                     handleTakeOpenOrder(selectedOrderDetails.id);
                     setSelectedOrderDetails(null);
                  }}
                  className="w-full bg-careem-primary/80 text-white font-bold py-4 px-6 rounded-xl hover:bg-[#255EE6] transition shadow-lg shadow-[#2D6BFF]/20 text-lg"
               >
                  Взять в работу
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpenOrders;
