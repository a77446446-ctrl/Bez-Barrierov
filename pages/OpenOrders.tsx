import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, UserRole, Order, OrderStatus } from '../types';
import { SERVICE_TYPES } from '../constants';
import OrderMap from '../components/OrderMap';
import { getSupabase } from '../services/supabaseClient';
import { profileRowToUser, orderRowToOrder, resolveProfileIdColumn } from '../services/mappers';
import { Clock3 } from 'lucide-react';

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

        const col = await resolveProfileIdColumn(supabase);
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .in(col, ids)
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
        <div className="bg-amber-500/10 border border-amber-500/20 backdrop-blur-xl rounded-[2rem] p-8 text-center shadow-2xl">
          <div className="w-20 h-20 bg-amber-500/20 text-amber-500 ring-1 ring-amber-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
            <i className="fas fa-user-shield text-3xl"></i>
          </div>
          <h3 className="font-display text-2xl font-bold text-white mb-3">Требуется верификация</h3>
          <p className="text-zinc-300 mb-8 max-w-md mx-auto leading-relaxed font-light">
            {!isProfileFullyFilled
              ? "Чтобы видеть доступные заказы и начать работу, пожалуйста, полностью заполните свой профиль (имя, телефон, описание, местоположение и услуги)."
              : "Ваш профиль находится на проверке. Дождитесь подтверждения администратором, чтобы получить доступ к заказам."}
          </p>
          {!isProfileFullyFilled && (
            <button
              onClick={() => navigate('/dashboard?tab=profile')}
              className="bg-careem-primary text-white font-medium py-3.5 px-8 rounded-2xl hover:bg-careem-accent transition shadow-lg shadow-careem-primary/25"
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
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="min-w-0">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-white tracking-tight truncate">Свободные заказы</h1>
          <p className="text-sm md:text-base text-zinc-400 mt-2 font-light">Здесь собраны все заказы со статусом «Свободен».</p>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="shrink-0 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-zinc-300 text-sm font-medium py-2.5 px-5"
        >
          Назад
        </button>
      </div>

      {hasActiveOrder ? (
        <div className="bg-careem-primary/5 border border-careem-primary/20 p-6 md:p-8 rounded-[2rem] mb-8 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-careem-primary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          <div className="relative z-10 flex items-start gap-5">
            <div className="w-14 h-14 bg-careem-primary/20 rounded-2xl flex items-center justify-center text-careem-primary ring-1 ring-careem-primary/30 shrink-0 shadow-inner">
              <i className="fas fa-tasks text-2xl"></i>
            </div>
            <div>
              <h3 className="font-display text-xl font-bold text-white mb-2">
                {user?.subscriptionStatus === 'active'
                  ? 'Активная подписка'
                  : user?.subscriptionStatus === 'pending'
                    ? 'Ожидание подтверждения подписки'
                    : 'У вас активный заказ'}
              </h3>
              <p className="text-[15px] text-zinc-300 font-light leading-relaxed mb-1">
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
          <div className="rounded-[2.5rem] border border-white/5 bg-white/[0.02] backdrop-blur-md p-10 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-careem-primary shadow-inner">
              <i className="fas fa-spinner text-[24px] animate-spin drop-shadow-[0_0_8px_rgba(37,99,235,0.5)]"></i>
            </div>
            <h2 className="font-display mt-5 text-xl font-bold text-white">Подождите немного — идёт обновление</h2>
            <p className="text-[15px] text-zinc-400 mt-2 font-light">Лента синхронизируется автоматически в реальном времени.</p>
          </div>
        ) : (
          <div className="rounded-[2.5rem] border border-white/5 bg-white/[0.02] backdrop-blur-md p-10 text-center">
            <h2 className="font-display text-xl font-bold text-white">Свободных заказов нет</h2>
            <p className="text-[15px] text-zinc-400 mt-2 font-light">Проверьте позже — новые заказы появляются автоматически.</p>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {openOrders.map((order) => {
            const customer = allUsers.find((u) => u.id === order.customerId);
            return (
              <div
                key={order.id}
                className="overflow-hidden shadow-2xl group relative text-white rounded-2xl"
                style={{
                  background: 'rgba(26, 26, 26, 0.5)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-careem-primary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none transition-transform duration-700 group-hover:scale-110"></div>
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none transition-transform duration-700 group-hover:scale-110"></div>
                <i className="fas fa-hand-holding-heart absolute -bottom-6 -right-6 text-[9rem] opacity-5 transform rotate-12 group-hover:rotate-0 group-hover:scale-110 transition duration-700 ease-out pointer-events-none"></i>
                {(() => {
                  const info = getServiceHeaderInfo(order.serviceType);
                  return info && (
                    <div
                      className="absolute inset-x-0 top-0 h-36 pointer-events-none mix-blend-screen"
                      style={{
                        backgroundColor: info.color,
                        backgroundImage: `url(${info.image})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        maskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)',
                        filter: 'opacity(0.4) saturate(1.5)',
                      }}
                    />
                  );
                })()}
                <div className="p-6 md:p-8 relative z-10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold drop-shadow-md">Заказ: ({order.id.split('-')[0]})</div>
                      <div className="font-display mt-2 text-xl font-bold text-white truncate drop-shadow-md">{order.serviceType}</div>
                      <div className="mt-3 flex flex-col items-start sm:flex-row sm:flex-wrap flex-wrap gap-2.5 text-[13px] text-zinc-300 drop-shadow-sm font-medium">
                        {order.date && (
                          <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 shadow-sm">
                            <i className="fas fa-calendar-alt text-zinc-400"></i>
                            {order.date}
                          </span>
                        )}
                        {order.time && (
                          <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 shadow-sm">
                            <i className="fas fa-clock text-zinc-400"></i>
                            {order.time}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 shadow-sm text-[#10B981]">
                          <i className="fas fa-ruble-sign text-[#10B981]"></i>
                          <span style={{ textShadow: '0 0 8px rgba(16,185,129,0.35)' }}>{order.totalPrice} ₽</span>
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-careem-primary/30 bg-careem-primary/15 text-careem-primary px-3.5 py-2 text-[11px] font-bold shadow-inner">
                      <Clock3 size={14} className="drop-shadow-[0_0_5px_rgba(37,99,235,0.8)]" />
                      Свободен
                    </div>
                  </div>

                  {order.details && (
                    <p className="mt-5 text-[13px] md:text-[14px] text-zinc-300 leading-relaxed font-light break-words">{order.details}</p>
                  )}

                  <div className="mt-6 rounded-2xl border border-white/5 bg-black/20 p-4">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Заказчик</div>
                    {customer ? (
                      <div className="mt-3 flex items-center gap-3.5">
                        <img
                          src={customer.avatar || `https://ui-avatars.com/api/?name=${customer.name}`}
                          alt={customer.name}
                          className="h-11 w-11 rounded-2xl border border-white/10 object-cover bg-zinc-800 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-display text-[15px] font-semibold text-white truncate">{customer.name}</div>
                          <div className="text-xs text-zinc-400 truncate mt-0.5 font-light">{customer.location || 'Город не указан'}</div>
                        </div>
                        <button
                          onClick={() => navigate(`/users/${customer.id}`)}
                          className="shrink-0 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-white text-xs font-medium py-2.5 px-3.5 shadow-sm"
                        >
                          Профиль
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-zinc-400 font-light">Пользователь не найден</div>
                    )}
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => handleTakeOpenOrder(order.id)}
                      className="flex-1 rounded-2xl bg-careem-primary hover:bg-careem-accent transition-all text-white text-sm font-medium py-3.5 shadow-lg shadow-careem-primary/25 hover:-translate-y-0.5"
                    >
                      Взять в работу
                    </button>
                    <button
                      onClick={() => setSelectedOrderDetails(order)}
                      className="flex-1 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/5 transition-colors text-white text-sm font-medium py-3.5"
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
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4 lg:p-6 animate-in fade-in duration-200"
          onClick={() => setSelectedOrderDetails(null)}
        >
          <div
            className="max-w-2xl w-full shadow-2xl shadow-black overflow-hidden flex flex-col max-h-[90vh] md:max-h-[85vh] animate-in zoom-in-95 duration-200 relative text-white rounded-2xl"
            style={{ background: '#1A1A1A', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.05)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-black/20 shrink-0">
              <div className="min-w-0 pr-4">
                <h3 className="font-display text-2xl font-bold text-white tracking-tight">Подробнее о заказе</h3>
                <p className="text-[13px] text-zinc-400 mt-1 truncate font-light">{selectedOrderDetails.serviceType}</p>
              </div>
              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="w-10 h-10 flex shrink-0 items-center justify-center rounded-2xl bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition"
              >
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 bg-white/[0.03] p-5 rounded-3xl border border-white/5">
                <div>
                  <p className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">Стоимость</p>
                  <p className="font-display text-3xl font-bold text-white">{selectedOrderDetails.totalPrice} ₽</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">Статус</p>
                  <div className="inline-flex items-center gap-2 rounded-xl border border-careem-primary/30 bg-careem-primary/10 px-3 py-1.5 text-xs font-bold text-careem-primary">
                    <Clock3 size={14} className="drop-shadow-[0_0_5px_rgba(37,99,235,0.8)]" />
                    Свободен
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-white/[0.02] rounded-3xl border border-white/5">
                  <p className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest mb-2">Дата</p>
                  <p className="font-bold text-white flex items-center gap-2.5 text-[15px]">
                    <i className="fas fa-calendar-alt text-careem-primary"></i>
                    {selectedOrderDetails.date || 'Не указана'}
                  </p>
                </div>
                <div className="p-4 bg-white/[0.02] rounded-3xl border border-white/5">
                  <p className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest mb-2">Время</p>
                  <p className="font-bold text-white flex items-center gap-2.5 text-[15px]">
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
                    <h4 className="font-display text-[15px] font-bold text-white mb-3 tracking-wide">Заказчик</h4>
                    <div className="bg-white/[0.02] p-4 rounded-3xl border border-white/5 flex items-center gap-4">
                      <img
                        src={customer.avatar || `https://ui-avatars.com/api/?name=${customer.name}`}
                        alt={customer.name}
                        className="h-12 w-12 rounded-2xl border border-white/10 object-cover bg-zinc-800 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-base font-bold text-white truncate">{customer.name}</div>
                        <div className="text-[13px] text-zinc-400 truncate mt-0.5 font-light">{customer.location || 'Город не указан'}</div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedOrderDetails(null);
                          navigate(`/users/${customer.id}`);
                        }}
                        className="shrink-0 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-white text-xs font-medium py-2.5 px-4 shadow-sm"
                      >
                        Профиль
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div className="mb-6">
                <h4 className="font-display text-[15px] font-bold text-white mb-3 tracking-wide">Описание задачи</h4>
                <div className="bg-white/[0.02] p-5 rounded-3xl border border-white/5 text-zinc-300 text-[14px] leading-relaxed font-light">
                  {selectedOrderDetails.details ? selectedOrderDetails.details : 'Описание отсутствует'}
                </div>
              </div>

              {selectedOrderDetails.voiceMessageUrl && (
                <div className="mb-6">
                  <h4 className="font-display text-[15px] font-bold text-white mb-3 tracking-wide">Голосовое сообщение</h4>
                  <div className="bg-white/[0.02] p-4 rounded-3xl border border-white/5">
                    <audio src={selectedOrderDetails.voiceMessageUrl} controls className="w-full h-10 custom-audio" />
                  </div>
                </div>
              )}

              <div className="mb-2">
                <h4 className="font-display text-[15px] font-bold text-white mb-3 tracking-wide">Маршрут и адрес</h4>

                {selectedOrderDetails.locationFrom && selectedOrderDetails.locationTo ? (
                  <>
                    <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-white/[0.02] rounded-3xl border border-white/5 p-4 flex items-start gap-3.5">
                        <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20 text-emerald-500">
                          <span className="font-bold text-[13px]">A</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Откуда</p>
                          <p className="text-zinc-200 leading-tight text-[13px] font-light truncate">
                            {formatAddress(selectedOrderDetails.locationFrom.address)}
                          </p>
                        </div>
                      </div>
                      <div className="bg-white/[0.02] rounded-3xl border border-white/5 p-4 flex items-start gap-3.5">
                        <div className="w-9 h-9 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/20 text-red-500">
                          <span className="font-bold text-[13px]">B</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Куда</p>
                          <p className="text-zinc-200 leading-tight text-[13px] font-light truncate">
                            {formatAddress(selectedOrderDetails.locationTo.address)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="h-64 w-full rounded-3xl overflow-hidden border border-white/5 ring-1 ring-white/10">
                      <OrderMap order={selectedOrderDetails} hideInfo />
                    </div>
                  </>
                ) : selectedOrderDetails.generalLocation ? (
                  <>
                    <div className="mb-4 bg-white/[0.02] rounded-3xl border border-white/5 p-4 flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-2xl bg-careem-primary/10 flex items-center justify-center shrink-0 border border-careem-primary/20 text-careem-primary">
                        <i className="fas fa-map-marker-alt text-[13px]"></i>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Адрес</p>
                        <p className="text-zinc-200 leading-tight text-[13px] font-light truncate">
                          {formatAddress(selectedOrderDetails.generalLocation.address)}
                        </p>
                      </div>
                    </div>
                    <div className="h-64 w-full rounded-3xl overflow-hidden border border-white/5 ring-1 ring-white/10">
                      <OrderMap order={selectedOrderDetails} hideInfo />
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] text-zinc-500 italic font-light">Адрес уточняется у заказчика</p>
                )}
              </div>
            </div>

            <div className="p-5 md:p-6 border-t border-white/5 bg-black/20 shrink-0">
              <button
                onClick={() => {
                  handleTakeOpenOrder(selectedOrderDetails.id);
                  setSelectedOrderDetails(null);
                }}
                className="w-full text-white font-medium py-4 px-6 rounded-2xl transition text-base"
                style={{
                  background: 'linear-gradient(135deg, #3B82F6 0%, #1E3A8A 100%)',
                  boxShadow: '0 10px 30px rgba(59,130,246,0.35)'
                }}
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
