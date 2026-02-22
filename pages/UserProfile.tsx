import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MOCK_USERS, SERVICE_TYPES } from '../constants';
import { Order, OrderStatus, Review, UserRole, User } from '../types';
import { MapContainer, TileLayer, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

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
  const [user, setUser] = useState<User | undefined>(undefined);
  const [completedOrdersCount, setCompletedOrdersCount] = useState(0);
  const [responsibilityPercent, setResponsibilityPercent] = useState(100);
  const [displayRating, setDisplayRating] = useState('5.0');

  useEffect(() => {
    // Try to find user in localStorage first, then MOCK_USERS
    const storedUsers = localStorage.getItem('bez_barrierov_users');
    const localUsers: User[] = storedUsers ? JSON.parse(storedUsers) : [];
    const foundUser = localUsers.find(u => u.id === id) || MOCK_USERS.find(u => u.id === id);
    setUser(foundUser);
  }, [id]);

  useEffect(() => {
    if (!user || user.role !== UserRole.EXECUTOR) return;

    const storedOrders = localStorage.getItem('bez_barrierov_orders');
    const orders: Order[] = storedOrders ? JSON.parse(storedOrders) : [];

    const executorOrders = orders.filter((o) => o.executorId === user.id);
    const completed = executorOrders.filter((o) => o.status === OrderStatus.COMPLETED).length;
    setCompletedOrdersCount(completed);

    const finished = executorOrders.filter((o) =>
      o.status === OrderStatus.COMPLETED ||
      o.status === OrderStatus.CANCELLED ||
      o.status === OrderStatus.REJECTED
    ).length;
    setResponsibilityPercent(finished > 0 ? Math.round((completed / finished) * 100) : 100);

    const avgFromReviews = (reviews?: Review[]) => {
      if (!reviews || reviews.length === 0) return null;
      const total = reviews.reduce((sum, r) => sum + r.rating, 0);
      return Number((total / reviews.length).toFixed(1));
    };

    const ratingValue = user.rating ?? avgFromReviews(user.reviews);
    setDisplayRating(typeof ratingValue === 'number' ? ratingValue.toFixed(1) : '5.0');
  }, [user]);

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
                    onClick={() => onBook ? onBook(user.id) : navigate(`/orders/create?executorId=${user.id}`)}
                    className="w-full sm:w-auto px-5 py-3 rounded-2xl text-sm font-semibold text-white bg-careem-primary hover:bg-[#255EE6] transition shadow-lg shadow-[#2D6BFF]/20"
                  >
                    Заказать услугу
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
                  <div className="text-2xl font-extrabold text-careem-primary">{responsibilityPercent}%</div>
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
