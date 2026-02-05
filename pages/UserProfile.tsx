import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MOCK_USERS, SERVICE_TYPES } from '../constants';
import { UserRole, User } from '../types';
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

  useEffect(() => {
    // Try to find user in localStorage first, then MOCK_USERS
    const storedUsers = localStorage.getItem('bez_barrierov_users');
    const localUsers: User[] = storedUsers ? JSON.parse(storedUsers) : [];
    const foundUser = localUsers.find(u => u.id === id) || MOCK_USERS.find(u => u.id === id);
    setUser(foundUser);
  }, [id]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Пользователь не найден</h2>
          <p className="text-gray-600 mb-4">Возможно, профиль был удален или ссылка неверна.</p>
          <button 
            onClick={() => navigate('/')}
            className="text-careem-primary hover:text-green-800 font-medium"
          >
            Вернуться на главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Profile Header */}
        <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
          <div className="bg-careem-primary h-32 w-full"></div>
          <div className="px-6 py-4 relative">
            <div className="absolute -top-16 left-6">
              {user.avatar ? (
                <img 
                  src={user.avatar} 
                  alt={user.name} 
                  className="h-32 w-32 rounded-full border-4 border-white object-cover bg-white max-w-full"
                />
              ) : (
                <div className="h-32 w-32 rounded-full border-4 border-white bg-green-100 flex items-center justify-center text-careem-primary text-4xl font-bold">
                  {user.name.charAt(0)}
                </div>
              )}
            </div>
            
            <div className="mt-16 sm:ml-40 sm:mt-0 sm:flex sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
                <p className="text-sm text-gray-500 flex items-center mt-1">
                  {user.role === UserRole.EXECUTOR ? (
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full mr-2">Помощник</span>
                  ) : (
                    <span className="bg-green-100 text-careem-primary text-xs px-2 py-0.5 rounded-full mr-2">Заказчик</span>
                  )}
                  {user.location && (
                    <span className="flex items-center text-gray-500">
                      <i className="fas fa-map-marker-alt mr-1"></i> {user.location}
                    </span>
                  )}
                </p>
              </div>
              
              <div className="mt-4 sm:mt-0">
                {user.role === UserRole.EXECUTOR && (
                  <button
                    onClick={() => onBook ? onBook(user.id) : navigate(`/orders/create?executorId=${user.id}`)}
                    className="w-full sm:w-auto px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-careem-primary hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-careem-primary"
                  >
                    Заказать услугу
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Profile Content */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">О себе</h3>
          <p className="text-gray-600 leading-relaxed">
            {user.description || "Пользователь не указал информацию о себе."}
          </p>
        </div>

        {/* Coverage Map */}
        {user.role === UserRole.EXECUTOR && user.locationCoordinates && (
          <div className="bg-white shadow rounded-lg p-6 mb-6 animate-in fade-in duration-500">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Зона работы</h3>
            <div className="h-64 rounded-xl overflow-hidden border border-gray-200 z-0 relative">
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
                     pathOptions={{ fillColor: '#004F32', color: '#004F32', fillOpacity: 0.2, weight: 2 }} 
                   />
                 </MapContainer>
            </div>
            <p className="text-sm text-gray-500 mt-3 flex items-start gap-2">
              <i className="fas fa-info-circle mt-0.5 text-careem-primary"></i>
              <span>Помощник работает в радиусе <strong>{user.coverageRadius || 5} км</strong> от своего местоположения. Точный адрес скрыт в целях безопасности.</span>
            </p>
          </div>
        )}

        {/* Services & Tariffs */}
        {user.role === UserRole.EXECUTOR && user.customServices && user.customServices.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Услуги и цены</h3>
            <div className="space-y-3">
              {user.customServices.filter(s => s.enabled).map(service => {
                const serviceInfo = SERVICE_TYPES.find(st => st.id === service.serviceId);
                if (!serviceInfo) return null;
                return (
                  <div key={service.serviceId} className="flex justify-between items-center border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                    <span className="text-gray-700">{serviceInfo.name}</span>
                    <span className="font-bold text-careem-primary">{service.price} ₽/час</span>
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
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Фото транспорта</h3>
                <div className="rounded-lg overflow-hidden w-full bg-gray-100 flex justify-center">
                  <img 
                    src={user.vehiclePhoto} 
                    alt="Транспорт" 
                    className="max-w-full h-auto max-h-[80vh] object-contain hover:scale-105 transition duration-500"
                  />
                </div>
              </div>
            )}

            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Статистика</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-careem-primary">{user.rating || "5.0"}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Рейтинг</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-careem-primary">12</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Выполнено заказов</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-careem-primary">100%</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Ответственность</div>
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
