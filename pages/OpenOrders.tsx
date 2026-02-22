import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, UserRole, Order, OrderStatus } from '../types';
import { MOCK_ORDERS } from '../constants';
import OrderMap from '../components/OrderMap';

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
  const now = Date.now();
  return orderList.filter((o) => {
    if (o.status !== OrderStatus.OPEN) return true;
    const dt = getOrderDateTimeMs(o);
    if (dt === null) return true;
    return dt > now;
  });
};

const OpenOrders: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>(() => {
    const stored = localStorage.getItem('bez_barrierov_orders');
    if (stored) return JSON.parse(stored);
    localStorage.setItem('bez_barrierov_orders', JSON.stringify(MOCK_ORDERS));
    return MOCK_ORDERS;
  });

  const [allUsers, setAllUsers] = useState<User[]>(() => {
    const stored = localStorage.getItem('bez_barrierov_users');
    const users = stored ? JSON.parse(stored) : [];
    return users.filter((u: User) => u.id !== 'u2' && u.id !== 'u3');
  });

  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);

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
    if (!user || user.role !== UserRole.EXECUTOR) return;
    setOrders((current) => {
      const cleaned = cleanupExpiredOpenOrders(current);
      if (cleaned.length !== current.length) {
        localStorage.setItem('bez_barrierov_orders', JSON.stringify(cleaned));
      }
      return cleaned;
    });
  }, [user]);

  const openOrders = useMemo(() => {
    if (!user || user.role !== UserRole.EXECUTOR) return [];
    return orders.filter((o) => o.status === OrderStatus.OPEN);
  }, [orders, user]);

  const handleTakeOpenOrder = (orderId: string) => {
    if (!user) return;
    const updatedOrders = orders.map((o) => {
      if (o.id !== orderId) return o;
      if (o.status !== OrderStatus.OPEN) return o;
      return {
        ...o,
        status: OrderStatus.CONFIRMED,
        executorId: user.id,
        responses: []
      };
    });
    setOrders(updatedOrders);
    localStorage.setItem('bez_barrierov_orders', JSON.stringify(updatedOrders));
    navigate('/dashboard');
  };

  if (!user || user.role !== UserRole.EXECUTOR) return null;

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

      {openOrders.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl p-8 text-center">
          <h2 className="text-lg font-bold text-slate-100">Свободных заказов нет</h2>
          <p className="text-sm text-slate-400 mt-2">Проверьте позже — новые заказы появляются автоматически.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {openOrders.map((order) => {
            const customer = allUsers.find((u) => u.id === order.customerId);
            return (
              <div
                key={order.id}
                className="rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Заказ #{order.id}</div>
                      <div className="mt-1 text-lg font-extrabold text-slate-100 truncate">{order.serviceType}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
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
                    <p className="mt-4 text-sm text-slate-300 leading-relaxed line-clamp-3">{order.details}</p>
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
                      className="flex-1 rounded-2xl bg-careem-primary hover:bg-[#255EE6] transition text-white text-sm font-semibold py-3 shadow-lg shadow-[#2D6BFF]/20"
                    >
                      Взять в работу
                    </button>
                    <button
                      onClick={() => setSelectedOrderDetails(order)}
                      className="rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-slate-100 text-sm font-semibold py-3 px-4"
                    >
                      Подробнее о заказе
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
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedOrderDetails(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
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
                        className="h-10 w-10 rounded-2xl border border-white/10 object-cover bg-[#13213A] max-w-full"
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

              {selectedOrderDetails.details && (
                <div className="mb-6">
                  <h4 className="text-sm font-bold text-gray-900 mb-2">Описание задачи</h4>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-gray-700 text-sm leading-relaxed">
                    {selectedOrderDetails.details}
                  </div>
                </div>
              )}

              {selectedOrderDetails.voiceMessageUrl && (
                <div className="mb-6">
                  <h4 className="text-sm font-bold text-gray-900 mb-2">Голосовое сообщение</h4>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <audio src={selectedOrderDetails.voiceMessageUrl} controls className="w-full h-10" />
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h4 className="text-sm font-bold text-gray-900 mb-2">Карта, точки и адрес</h4>

                {selectedOrderDetails.locationFrom && selectedOrderDetails.locationTo ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Точка А (откуда)</p>
                        <p className="text-sm text-gray-900 leading-relaxed">{selectedOrderDetails.locationFrom.address || 'Не указано'}</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Точка Б (куда)</p>
                        <p className="text-sm text-gray-900 leading-relaxed">{selectedOrderDetails.locationTo.address || 'Не указано'}</p>
                      </div>
                    </div>
                    <OrderMap order={selectedOrderDetails} hideInfo />
                  </>
                ) : selectedOrderDetails.generalLocation ? (
                  <>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-1">Адрес</p>
                      <p className="text-sm text-gray-900 leading-relaxed">{selectedOrderDetails.generalLocation.address || 'Не указано'}</p>
                    </div>
                    <OrderMap order={selectedOrderDetails} hideInfo />
                  </>
                ) : (
                  <p className="text-sm text-gray-400 italic">Адрес уточняется у заказчика</p>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="w-full bg-careem-primary text-white font-bold py-3 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-100"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpenOrders;
