
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, UserRole, Order, OrderStatus, Review, Location, Notification } from '../types';
import { SERVICE_TYPES } from '../constants';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import OrderMap from '../components/OrderMap';
import { createClient } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';

// OrderMap component removed (imported from components/OrderMap)

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
  // Temporarily allow all open orders
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

// Helper component for map events
const DashboardMapEvents = ({
  setLocationCoords,
  setLocationAddress,
  setHasUnsavedChanges
}: any) => {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      setLocationCoords({ lat, lng });
      setHasUnsavedChanges(true);

      // Reverse geocoding
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
        .then(response => response.json())
        .then(data => {
          if (data && data.display_name) {
            setLocationAddress(data.display_name);
            setLocationCoords((prev: any) => ({ ...prev, address: data.display_name }));
          }
        })
        .catch(err => console.error('Geocoding error:', err));
    },
  });
  return null;
};

interface DashboardProps {
  user: User;
  onUpdateStatus: (orderId: string, newStatus: OrderStatus, rejectionReason?: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onUpdateStatus }) => {
  const { updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'orders' | 'profile' | 'subscription'>('orders');
  const ordersHeaderRef = useRef<HTMLHeadingElement | null>(null);
  const profileEditorRef = useRef<HTMLDivElement | null>(null);
  const verificationTimerRef = useRef<number | null>(null);
  const profileIdColumnRef = useRef<'id' | 'user_id'>('id');
  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const getSupabase = () => {
    const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
    const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) return null;
    return createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        lock: async (_name, _acquireTimeout, fn) => {
          return await fn();
        }
      }
    });
  };

  const resolveProfileIdColumn = async (supabase: any): Promise<'id' | 'user_id'> => {
    const cached = profileIdColumnRef.current;
    if (cached === 'user_id') return cached;
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (
      error &&
      (/column profiles\.id does not exist/i.test(error.message) ||
        /Could not find the 'id' column of 'profiles' in the schema cache/i.test(error.message))
    ) {
      profileIdColumnRef.current = 'user_id';
      return 'user_id';
    }
    profileIdColumnRef.current = 'id';
    return 'id';
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
      isSubscribed: row.is_subscribed ?? row.isSubscribed,
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

  const userToProfileUpdate = (u: User) => {
    return {
      role: u.role,
      name: u.name,
      email: u.email,
      phone: u.phone,
      telegram_id: u.telegramId ?? null,
      avatar: u.avatar ?? null,
      is_subscribed: u.isSubscribed ?? null,
      rating: u.rating ?? null,
      reviews_count: u.reviewsCount ?? null,
      reviews: u.reviews ?? null,
      location: u.location ?? null,
      location_coordinates: u.locationCoordinates ?? null,
      coverage_radius: u.coverageRadius ?? null,
      description: u.description ?? null,
      profile_verification_status: u.profileVerificationStatus ?? null,
      vehicle_photo: u.vehiclePhoto ?? null,
      custom_services: u.customServices ?? null,
      subscription_status: u.subscriptionStatus ?? null,
      subscription_start_date: u.subscriptionStartDate ?? null,
      subscription_end_date: u.subscriptionEndDate ?? null,
      subscribed_to_customer_id: u.subscribedToCustomerId ?? null,
      subscription_request_to_customer_id: u.subscriptionRequestToCustomerId ?? null,
      subscribed_executor_id: u.subscribedExecutorId ?? null,
      notifications: u.notifications ?? null
    };
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

  const [orders, setOrders] = useState<Order[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(true);
  const [realRatings, setRealRatings] = useState<Record<string, string>>({});

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

  const [allUsers, setAllUsers] = useState<User[]>([]);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTrigger(prev => prev + 1);
    }, 60000); // Update every 1 minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let isActive = true;
    void (async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (!isActive) return;
      if (error || !Array.isArray(data)) {
        setAllUsers([]);
        return;
      }
      setAllUsers(data.map(profileRowToUser));
    })();
    return () => {
      isActive = false;
    };
  }, [user.id, refreshTrigger]);

  const [servicesState, setServicesState] = useState(
    SERVICE_TYPES.map(st => {
      const custom = user.customServices?.find(cs => cs.serviceId === st.id);
      return {
        serviceId: st.id,
        enabled: custom?.enabled ?? false,
        price: custom?.price ?? st.pricePerHour
      };
    })
  );
  const [showOpenOrders, setShowOpenOrders] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    const open = params.get('open');

    if (user.role === UserRole.EXECUTOR && open === '1') {
      setActiveTab('orders');
      setShowOpenOrders(true);
      return;
    }

    if (tab === 'profile' || tab === 'subscription' || tab === 'orders') {
      setActiveTab(tab);
      if (tab === 'orders') setShowOpenOrders(false);
      return;
    }
    setActiveTab('orders');
    setShowOpenOrders(false);
  }, [location.search, user.role]);

  // Profile State
  const [locationCoords, setLocationCoords] = useState<Location | undefined>(user.locationCoordinates);
  const [locationAddress, setLocationAddress] = useState<string>(user.locationCoordinates?.address || '');
  const [coverageRadius, setCoverageRadius] = useState<number>(user.coverageRadius || 5);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(user.avatar);
  const [vehiclePhotoPreview, setVehiclePhotoPreview] = useState(user.vehiclePhoto);
  const [profileDescription, setProfileDescription] = useState<string>(
    user.description === 'Новый пользователь' ? '' : (user.description || '')
  );
  const [profileVerificationStatus, setProfileVerificationStatus] = useState<User['profileVerificationStatus']>(
    user.profileVerificationStatus || 'none'
  );

  useEffect(() => {
    setProfileVerificationStatus(user.profileVerificationStatus || 'none');

    // Auto-verify after 15 seconds if pending
    if (user.role === UserRole.EXECUTOR && user.profileVerificationStatus === 'pending') {
      const timer = setTimeout(() => {
        const verifiedUser = { ...user, profileVerificationStatus: 'verified' as const };
        
        // Update local state
        setProfileVerificationStatus('verified');
        setAllUsers(prev => prev.map((u: User) => (u.id === user.id ? verifiedUser : u)));
        
        // Update global context
        updateUser(verifiedUser);

        // Redirect to orders page immediately
        navigate('/dashboard?tab=orders');
      }, 15_000);
      
      return () => clearTimeout(timer);
    }
  }, [user.profileVerificationStatus, user.role, user.id]);

  // Helper for map events handled inline
  const renderProfileEditor = () => (
    <div ref={profileEditorRef} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-gray-900">
      <h3 className="text-lg font-bold text-gray-900 mb-6">Редактирование профиля</h3>
      <form className="space-y-6" onSubmit={async (e) => {
        e.preventDefault();
        // @ts-ignore
        const name = e.target.name.value;
        // @ts-ignore
        const email = e.target.email.value;
        if (user.role === UserRole.EXECUTOR && (!canPublishProfile || profileVerificationStatus === 'pending')) return;

        const customServices = servicesState.filter(s => s.enabled).map(s => ({
          serviceId: s.serviceId,
          price: Number(s.price),
          enabled: true
        }));

        const newUser = {
          ...user,
          name,
          email,
          description: profileDescription,
          profileVerificationStatus: user.role === UserRole.EXECUTOR ? 'pending' : (user.profileVerificationStatus || 'none'),
          customServices,
          locationCoordinates: locationCoords,
          coverageRadius: coverageRadius,
          avatar: avatarPreview,
          vehiclePhoto: vehiclePhotoPreview
        };

        // Optimistic update
        setAllUsers(prev => prev.map((u: User) => (u.id === user.id ? newUser : u)));
        setHasUnsavedChanges(false);
        updateUser(newUser);
        setProfileVerificationStatus(newUser.profileVerificationStatus || 'none');
      }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Полное имя</label>
            <input name="name" type="text" defaultValue={user.name} onChange={() => setHasUnsavedChanges(true)} className="w-full bg-gray-50 border-gray-200 rounded-xl py-3 px-4 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-careem-primary outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
              {user.id?.startsWith('telegram-') ? 'Профиль' : 'Email'}
            </label>
            <input name="email" type="email" defaultValue={user.email} onChange={() => setHasUnsavedChanges(true)} className="w-full bg-gray-50 border-gray-200 rounded-xl py-3 px-4 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-careem-primary outline-none" />
          </div>
        </div>

        {user.role === UserRole.EXECUTOR && (
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <label className="block text-xs font-bold text-gray-400 uppercase mb-4">
              Желаемое место работы и радиус охвата <span className="text-red-500">*</span>
            </label>
            {locationAddress && (
              <p className="text-sm text-gray-700 mb-3 font-medium bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                <i className="fas fa-map-marker-alt text-red-500 mr-2"></i>
                {locationAddress}
              </p>
            )}
            <div className="h-64 rounded-xl overflow-hidden mb-4 border border-gray-300 relative z-0">
              <MapContainer
                center={locationCoords ? [locationCoords.lat, locationCoords.lng] : [55.75, 37.61]}
                zoom={10}
                style={{ width: '100%', height: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  keepBuffer={4}
                />
                <MapInvalidator />

                <DashboardMapEvents
                  setLocationCoords={setLocationCoords}
                  setLocationAddress={setLocationAddress}
                  setHasUnsavedChanges={setHasUnsavedChanges}
                />

                {locationCoords && (
                  <>
                    <Marker position={[locationCoords.lat, locationCoords.lng]} />
                    {coverageRadius && (
                      <Circle
                        center={[locationCoords.lat, locationCoords.lng]}
                        radius={coverageRadius * 1000}
                        pathOptions={{ fillColor: '#828282', color: '#828282', fillOpacity: 0.5, weight: 2 }}
                      />
                    )}
                  </>
                )}
              </MapContainer>
            </div>
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Радиус (км): {coverageRadius}</label>
              <input
                type="range"
                min="1"
                max="50"
                value={coverageRadius}
                onChange={(e) => {
                  setCoverageRadius(Number(e.target.value));
                  setHasUnsavedChanges(true);
                }}
                className="w-full"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">Кликните на карту, чтобы установить центр рабочей зоны.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Фотография профиля</label>
            <label className="mt-1 flex justify-center items-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:border-careem-primary transition cursor-pointer relative group block w-full h-48 overflow-hidden bg-gray-50">
              {avatarPreview ? (
                <>
                  <img src={avatarPreview} alt="Avatar" className="absolute inset-0 w-full h-full object-contain bg-gray-50 opacity-100 group-hover:opacity-50 transition-opacity duration-300" />
                  <div className="relative z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center">
                    <i className="fas fa-camera text-gray-800 text-3xl mb-2"></i>
                    <span className="text-sm font-bold text-gray-800 bg-white/80 px-3 py-1 rounded-full">Изменить фото</span>
                  </div>
                </>
              ) : (
                <div className="space-y-1 text-center w-full relative z-10">
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex text-sm text-gray-600 justify-center">
                    <span className="relative rounded-md font-medium text-careem-primary hover:text-green-500 focus-within:outline-none">
                      <span>Загрузить фото</span>
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">PNG, JPG, GIF до 10MB</p>
                </div>
              )}
              <input type="file" className="sr-only" accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const base64String = reader.result as string;
                    setAvatarPreview(base64String);
                    setHasUnsavedChanges(true);
                  };
                  reader.readAsDataURL(file);
                }
              }} />
            </label>
          </div>

          {user.role === UserRole.EXECUTOR && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Фото транспорта <span className="text-gray-300 font-normal">(не обязательно)</span></label>
              <label className="mt-1 flex justify-center items-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:border-careem-primary transition cursor-pointer relative group block w-full h-48 overflow-hidden bg-gray-50">
                {vehiclePhotoPreview ? (
                  <>
                    <img src={vehiclePhotoPreview} alt="Vehicle" className="absolute inset-0 w-full h-full object-contain bg-gray-50 opacity-100 group-hover:opacity-50 transition-opacity duration-300" />
                    <div className="relative z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center">
                      <i className="fas fa-camera text-gray-800 text-3xl mb-2"></i>
                      <span className="text-sm font-bold text-gray-800 bg-white/80 px-3 py-1 rounded-full">Изменить фото</span>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1 text-center w-full relative z-10">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="flex text-sm text-gray-600 justify-center">
                      <span className="relative rounded-md font-medium text-careem-primary hover:text-green-500 focus-within:outline-none">
                        <span>Загрузить фото</span>
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">PNG, JPG, GIF до 10MB</p>
                  </div>
                )}
                <input type="file" className="sr-only" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      const base64String = reader.result as string;
                      setVehiclePhotoPreview(base64String);
                      setHasUnsavedChanges(true);
                    };
                    reader.readAsDataURL(file);
                  }
                }} />
              </label>
            </div>
          )}
        </div>

        {user.role === UserRole.EXECUTOR && (
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-4">
              Услуги и тарифы <span className="text-red-500">*</span>
            </label>
            <div className="bg-gray-50 rounded-xl p-4 space-y-4 border border-gray-200">
              {SERVICE_TYPES.map(service => {
                const state = servicesState.find(s => s.serviceId === service.id)!;
                return (
                  <div key={service.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-white rounded-lg shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id={`service-${service.id}`}
                        checked={state.enabled}
                        onChange={(e) => {
                          handleServiceChange(service.id, 'enabled', e.target.checked);
                          setHasUnsavedChanges(true);
                        }}
                        className="w-5 h-5 text-careem-primary rounded focus:ring-careem-primary border-gray-300"
                      />
                      <label htmlFor={`service-${service.id}`} className="text-sm font-medium text-gray-700 cursor-pointer select-none">
                        {service.name}
                      </label>
                    </div>

                    {state.enabled && (
                      <div className="flex items-center gap-2 sm:justify-end">
                        <input
                          type="number"
                          value={state.price}
                          onChange={(e) => {
                            handleServiceChange(service.id, 'price', e.target.value);
                            setHasUnsavedChanges(true);
                          }}
                          className="w-24 px-2 py-1 text-right border border-gray-300 rounded-md focus:ring-careem-primary focus:border-careem-primary text-sm text-gray-900 placeholder-gray-400"
                          placeholder={service.pricePerHour.toString()}
                        />
                        <span className="text-sm text-gray-500">₽/час</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
            О себе {user.role === UserRole.EXECUTOR && <span className="text-red-500">*</span>}
          </label>
          <textarea name="description" rows={4} value={profileDescription} onChange={(e) => { setProfileDescription(e.target.value); setHasUnsavedChanges(true); }} className="w-full bg-gray-50 border-gray-200 rounded-xl py-3 px-4 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-careem-primary outline-none" placeholder="Расскажите о своем опыте и навыках..."></textarea>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 gap-4">
          {user.role === UserRole.EXECUTOR ? (
            <div className="flex flex-col gap-1">
              {profileVerificationStatus !== 'none' && (
                <div className={`text-sm font-semibold flex items-center gap-2 ${profileVerificationStatus === 'verified' ? 'text-green-600' : 'text-amber-600'}`}>
                  {profileVerificationStatus === 'verified' ? (
                    <i className="fas fa-circle-check"></i>
                  ) : (
                    <i className="fas fa-clock"></i>
                  )}
                  {profileVerificationStatus === 'verified' ? 'Проверен' : 'Профиль на проверке'}
                </div>
              )}
              <p className="text-xs text-gray-500">
                Поля, отмеченные <span className="text-red-500">*</span>, обязательны для заполнения.
              </p>
            </div>
          ) : (
            <div />
          )}

          <button
            type="submit"
            disabled={
              (user.role === UserRole.EXECUTOR && !canPublishProfile) ||
              profileVerificationStatus === 'pending' ||
              (user.role === UserRole.CUSTOMER && !hasUnsavedChanges)
            }
            className="w-full sm:w-auto bg-careem-primary text-white font-bold py-3 px-8 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-careem-primary"
          >
            {user.role === UserRole.EXECUTOR
              ? (profileVerificationStatus === 'verified' && !hasUnsavedChanges ? 'Опубликовано' : (profileVerificationStatus === 'pending' ? 'На проверке...' : 'Опубликовать'))
              : 'Сохранить изменения'}
          </button>
        </div>
      </form>
    </div>
  );


  const handleTabChange = (tab: 'orders' | 'profile' | 'subscription') => {
    if (hasUnsavedChanges) {
      if (!window.confirm('У вас есть несохраненные изменения. Вы уверены, что хотите уйти?')) {
        return false;
      }
      setHasUnsavedChanges(false);
    }
    setActiveTab(tab);
    if (tab === 'orders') setShowOpenOrders(false);
    return true;
  };

  const scrollToElement = (element: HTMLElement | null) => {
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleGoToOrders = () => {
    if (!handleTabChange('orders')) return;
    window.setTimeout(() => {
      scrollToElement(ordersHeaderRef.current);
    }, 60);
  };

  const handleGoToProfile = () => {
    if (window.innerWidth < 1024) {
      setIsProfileModalOpen(true);
      return;
    }
    if (!handleTabChange('profile')) return;
    window.setTimeout(() => {
      scrollToElement(profileEditorRef.current);
    }, 60);
  };

  const isExecutor = user.role === UserRole.EXECUTOR;
  const hasWorkPlace = !!locationCoords && (coverageRadius || 0) > 0;
  const hasAtLeastOneService = servicesState.some((s) => s.enabled);
  const hasAbout = profileDescription.trim().length > 0;
  const canPublishProfile = !isExecutor || (hasWorkPlace && hasAtLeastOneService && hasAbout && hasUnsavedChanges);

  useEffect(() => {
    return () => {
      if (verificationTimerRef.current !== null) {
        window.clearTimeout(verificationTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isExecutor) return;
    if (hasUnsavedChanges && profileVerificationStatus === 'verified') {
      setProfileVerificationStatus('none');
    }
  }, [hasUnsavedChanges, isExecutor, profileVerificationStatus]);

  useEffect(() => {
    if (user.role !== UserRole.EXECUTOR) return;

    const cleanup = () => {
      setOrders((current) => {
        const cleaned = cleanupExpiredOpenOrders(current);
        return cleaned;
      });
    };

    cleanup();
    const intervalId = window.setInterval(cleanup, 30_000);
    return () => window.clearInterval(intervalId);
  }, [user.role]);

  // Self-Repair Logic for Subscriptions (Handles RLS issues)
  useEffect(() => {
    if (!user || !user.id || user.role !== UserRole.EXECUTOR) return;

    // 1. Check for Pending Confirmation
    if (user.subscriptionStatus === 'pending' && user.subscriptionRequestToCustomerId) {
      const customer = allUsers.find(u => u.id === user.subscriptionRequestToCustomerId);
      if (!customer) return;

      // 1.1 CONFIRMATION CHECK
      if (customer.subscribedExecutorId === user.id) {
        console.log('Self-repair: Customer confirmed me!');
        const startDate = new Date().toISOString();
        const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const updatedMe = {
          ...user,
          subscriptionStatus: 'active' as const,
          subscriptionStartDate: startDate,
          subscriptionEndDate: endDate,
          subscribedToCustomerId: customer.id,
          subscriptionRequestToCustomerId: undefined
        };
        updateUser(updatedMe);
      }
      // 1.2 REJECTION CHECK
      else if (customer.subscriptionRequestToCustomerId === `REJECTED:${user.id}`) {
        console.log('Self-repair: Customer rejected me!');
        const updatedMe = {
          ...user,
          subscriptionStatus: 'none' as const,
          subscriptionRequestToCustomerId: undefined
        };
        updateUser(updatedMe);
      }
    }

    // 2. Check for Active Subscription Cancellation
    if (user.subscriptionStatus === 'active' && user.subscribedToCustomerId) {
      const customer = allUsers.find(u => u.id === user.subscribedToCustomerId);
      
      // If customer is found and they are NOT subscribed to me (or subscribed to someone else), cancel my sub
      if (customer && customer.subscribedExecutorId !== user.id) {
        console.log('Self-repair: Customer cancelled subscription!');
        
        // Check for existing recent notification to avoid duplicates
        const existingNotif = user.notifications?.find(n => 
            n.title === 'Подписка отменена' && 
            n.message.includes(`Заказчик ${customer.name}`) &&
            (Date.now() - new Date(n.date).getTime() < 60000) // Within last minute
        );

        let newNotifications = user.notifications || [];
        if (!existingNotif) {
             const notification: Notification = {
              id: Date.now().toString(),
              type: 'warning',
              title: 'Подписка отменена',
              message: `Заказчик ${customer.name} отменил подписку.`,
              date: new Date().toISOString(),
              read: false
            };
            newNotifications = [notification, ...newNotifications];
        }

        const updatedMe = {
          ...user,
          subscriptionStatus: 'none' as const,
          subscribedToCustomerId: undefined,
          subscriptionStartDate: undefined,
          subscriptionEndDate: undefined,
          notifications: newNotifications
        };
        updateUser(updatedMe);
      }
    }
  }, [user, allUsers, updateUser]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let isActive = true;
    
    setIsOrdersLoading(true);

    const loadOrders = async () => {
      if (user.role === UserRole.EXECUTOR) {
        // Check for active confirmed order first
        const { data: activeOrders } = await supabase
           .from('orders')
           .select('*')
           .eq('executor_id', user.id)
           .eq('status', OrderStatus.CONFIRMED);

        if (activeOrders && activeOrders.length > 0) {
           // Executor is busy, only show the active order
           setOrders(activeOrders.map(orderRowToOrder));
           setIsOrdersLoading(false);
           return;
        }
      }

      let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (user.role === UserRole.CUSTOMER) {
        query = query.eq('customer_id', user.id);
      } else if (user.role === UserRole.EXECUTOR) {
        query = query.or(`executor_id.eq.${user.id},status.eq.${OrderStatus.OPEN}`);
      }
      const { data, error } = await query;
      if (!isActive) return;
      if (error || !Array.isArray(data)) {
        setOrders([]);
        setIsOrdersLoading(false);
        return;
      }
      setOrders(data.map(orderRowToOrder));
      setIsOrdersLoading(false);
    };

    void loadOrders();

    // Подписка на изменения в реальном времени (Supabase Realtime)
    const channel = supabase
      .channel('realtime-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (!isActive) return;

          if (payload.eventType === 'INSERT') {
            const newOrder = orderRowToOrder(payload.new);
            let isRelevant = false;
            
            if (user.role === UserRole.CUSTOMER) {
              if (newOrder.customerId === user.id) isRelevant = true;
            } else if (user.role === UserRole.EXECUTOR) {
              if (newOrder.executorId === user.id || newOrder.status === OrderStatus.OPEN) isRelevant = true;
            }
            
            if (isRelevant) {
              setOrders((prev) => [newOrder, ...prev]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedOrder = orderRowToOrder(payload.new);

            // Notify Customer if Executor rejected their order
            const currentUser = userRef.current;
            if (currentUser.role === UserRole.CUSTOMER && updatedOrder.customerId === currentUser.id) {
               if (updatedOrder.status === OrderStatus.OPEN && updatedOrder.rejectionReason) {
                   const notifMessage = `Ваш заказ на ${updatedOrder.date} ${updatedOrder.time} был отклонен. Причина: ${updatedOrder.rejectionReason}`;
                   const alreadyExists = currentUser.notifications?.some(n => n.message === notifMessage);
                   
                   if (!alreadyExists) {
                       const notification: Notification = {
                           id: Date.now().toString(),
                           type: 'warning',
                           title: 'Заказ отклонен',
                           message: notifMessage,
                           date: new Date().toISOString(),
                           read: false
                       };
                       const updatedUser = { 
                           ...currentUser, 
                           notifications: [notification, ...(currentUser.notifications || [])] 
                       };
                       updateUser(updatedUser);
                   }
               }
            }

            setOrders((prev) => {
              const exists = prev.find((o) => o.id === updatedOrder.id);
              if (exists) {
                return prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
              } else {
                // Если заказа не было в списке, но он стал релевантным (например, стал OPEN)
                let isRelevant = false;
                if (user.role === UserRole.EXECUTOR && updatedOrder.status === OrderStatus.OPEN) isRelevant = true;
                if (isRelevant) return [updatedOrder, ...prev];
                return prev;
              }
            });
          } else if (payload.eventType === 'DELETE') {
            setOrders((prev) => prev.filter((o) => o.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [user.id, user.role]);

  const myOrders = orders.filter(o => {
    if (user.role === UserRole.CUSTOMER) {
      return o.customerId === user.id;
    } else {
      // For Executor: Show orders specifically addressed to them (PENDING or CONFIRMED)
      if (o.executorId === user.id) return true;
      return false;
    }
  });

  const openOrders = orders.filter(o => {
    if (user.role === UserRole.EXECUTOR) {
      // Show OPEN orders (available for pickup)
      return o.status === OrderStatus.OPEN;
    }
    return false;
  });

  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const executorAssignedCount = user.role === UserRole.EXECUTOR
    ? orders.filter(o =>
        o.executorId === user.id &&
        o.status === OrderStatus.PENDING
      ).length
    : 0;

  const executorOpenCount = user.role === UserRole.EXECUTOR ? openOrders.length : 0;

  // Combined list for display based on view mode
  const allDisplayedOrders = user.role === UserRole.EXECUTOR && showOpenOrders ? openOrders : myOrders;

  const activeOrders = allDisplayedOrders.filter(o => o.status !== OrderStatus.COMPLETED);
  const completedOrders = allDisplayedOrders.filter(o => o.status === OrderStatus.COMPLETED);

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus, rejectionReason?: string) => {
    // 1. Optimistic UI Update
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus, rejectionReason } : o)));
    onUpdateStatus(orderId, newStatus, rejectionReason);

    // 2. Background DB Update
    const supabase = getSupabase();
    if (!supabase) return;
    
    supabase
      .from('orders')
      .update({ status: newStatus, rejection_reason: rejectionReason ?? null })
      .eq('id', orderId)
      .then(({ error }) => {
        if (error) {
          console.error('Error updating order status:', error);
          // Optional: Revert state here if needed
        }
      });
  };

  const handleServiceChange = (id: string, field: 'enabled' | 'price', value: any) => {
    setServicesState(prev => prev.map(s => {
      if (s.serviceId === id) {
        return { ...s, [field]: value };
      }
      return s;
    }));
  };

  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleRejectOrder = async () => {
    if (rejectingOrderId && rejectionReason.trim()) {
      // Force reopening for now to ensure visibility across all helpers
      const canBecomeOpen = true; 
      const nextStatus = OrderStatus.OPEN;

      // 1. Close Modal Immediately
      const currentOrderId = rejectingOrderId;
      const currentReason = rejectionReason;
      
      setRejectingOrderId(null);
      setRejectionReason('');

      // 2. Optimistic UI Update
      setOrders((prev) =>
        prev.map((o) =>
          o.id === currentOrderId
            ? {
                ...o,
                status: nextStatus,
                rejectionReason: currentReason,
                executorId: undefined, // Always clear executor
                responses: [] // Always clear responses
              }
            : o
        )
      );

      // 3. Background DB Update
      const supabase = getSupabase();
      if (supabase) {
        const updatePayload: any = {
          status: nextStatus,
          rejection_reason: currentReason,
          executor_id: null, // Explicitly set to null
          responses: []      // Explicitly clear responses
        };

        supabase
          .from('orders')
          .update(updatePayload)
          .eq('id', currentOrderId)
          .then(({ error }) => {
             if (error) {
               console.error('Error rejecting order:', error);
               toast.error('Не удалось обновить статус заказа. Пожалуйста, обратитесь к администратору или попробуйте позже.');
               // Revert optimistic update?
               // ...
             } else {
               toast.success('Заказ успешно отклонен');
             }
          });
      }
    }
  };

  const [completingOrderId, setCompletingOrderId] = useState<string | null>(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [viewingCustomer, setViewingCustomer] = useState<User | null>(null);

  // Subscription Cancellation State
  const [isCancelSubscriptionModalOpen, setIsCancelSubscriptionModalOpen] = useState(false);
  const [cancelSubscriptionReason, setCancelSubscriptionReason] = useState('');

  // Delete Profile State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteProfile = async () => {
    if (!deletePassword.trim()) {
      setDeleteError('Введите пароль для подтверждения');
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setDeleteError('Ошибка подключения к серверу');
      return;
    }

    // 1. Verify password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: deletePassword,
    });

    if (signInError) {
      setDeleteError('Неверный пароль');
      return;
    }

    // 2. Confirm deletion
    if (!window.confirm('Вы точно хотите удалить профиль без возвратно?')) {
      return;
    }

    // 3. Delete data
    try {
      await supabase.functions.invoke('delete-user', { body: { userId: user.id } });
    } catch {}
    
    try {
      const col = await resolveProfileIdColumn(supabase);
      await supabase.from('profiles').delete().eq(col, user.id);
    } catch (e) {
      console.error('Error deleting profile:', e);
    }

    await supabase.auth.signOut();

    const updatedUsers = allUsers.filter(u => u.id !== user.id);
    setAllUsers(updatedUsers);
    logout();
    window.location.href = '/auth?mode=register&deleted=1';
  };

  const handleCompleteOrder = async () => {
    if (completingOrderId) {
      const orderId = completingOrderId;
      const ratingValue = reviewRating;
      const reviewValue = reviewText;

      setCompletingOrderId(null);
      setReviewRating(5);
      setReviewText('');

      handleGoToOrders();

      const supabase = getSupabase();
      if (supabase) {
        await supabase
          .from('orders')
          .update({ status: OrderStatus.COMPLETED, rating: ratingValue, review: reviewValue })
          .eq('id', orderId);
      }

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: OrderStatus.COMPLETED, rating: ratingValue, review: reviewValue } : o
        )
      );

      // 2. Update Executor User
      const order = orders.find(o => o.id === orderId);
      if (order && order.executorId) {
        const executor = allUsers.find(u => u.id === order.executorId);
        if (executor) {
          const currentReviews = executor.reviews || [];
          const newReview: Review = {
            id: Date.now().toString(),
            authorId: user.id,
            authorName: user.name,
            rating: ratingValue,
            text: reviewValue,
            date: new Date().toLocaleDateString()
          };

          const newReviews = [...currentReviews, newReview];
          const totalRating = newReviews.reduce((sum, r) => sum + r.rating, 0);
          const newAverageRating = Number((totalRating / newReviews.length).toFixed(1));
          const updatedExecutor: User = {
            ...executor,
            reviews: newReviews,
            reviewsCount: newReviews.length,
            rating: newAverageRating
          };
          setAllUsers(prev => prev.map(u => (u.id === updatedExecutor.id ? updatedExecutor : u)));
          const supabaseProfiles = getSupabase();
          if (supabaseProfiles) {
            const col = await resolveProfileIdColumn(supabaseProfiles);
            await supabaseProfiles.from('profiles').update(userToProfileUpdate(updatedExecutor)).eq(col, updatedExecutor.id);
          }
        }
      }

      // Notify parent/system
      onUpdateStatus(orderId, OrderStatus.COMPLETED);
    }
  };

  const handleTakeOpenOrder = async (orderId: string) => {
    // 1. Optimistic UI Update
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: OrderStatus.CONFIRMED, executorId: user.id, responses: [] } : o))
    );
    onUpdateStatus(orderId, OrderStatus.CONFIRMED);

    // 2. Background DB Update
    const supabase = getSupabase();
    if (supabase) {
      supabase.from('orders').update({ status: OrderStatus.CONFIRMED, executor_id: user.id, responses: [] }).eq('id', orderId).then();
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    // 1. Optimistic UI Update
    setOrders((prev) => prev.filter((o) => o.id !== orderId));

    // 2. Background DB Update
    const supabase = getSupabase();
    if (supabase) {
      supabase.from('orders').delete().eq('id', orderId).then();
    }
  };

  const handleSelectExecutor = async (orderId: string, executorId: string) => {
    // 1. Optimistic UI Update
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: OrderStatus.CONFIRMED, executorId, responses: [] } : o))
    );

    // 2. Background DB Update
    const supabase = getSupabase();
    if (supabase) {
      supabase.from('orders').update({ status: OrderStatus.CONFIRMED, executor_id: executorId, responses: [] }).eq('id', orderId).then();
    }
  };

  const handleSubscribeRequest = async (customerId: string) => {
    const updatedUser = {
      ...user,
      subscriptionStatus: 'pending' as const,
      subscriptionRequestToCustomerId: customerId
    };
    
    // Close modal immediately
    setViewingCustomer(null);
    
    // Update local state
    setAllUsers(prev => prev.map(u => (u.id === user.id ? updatedUser : u)));
    updateUser(updatedUser); // Handles DB update in background

    // Show info after a short delay to allow UI to update
    setTimeout(() => {
      alert('Запрос на подписку отправлен! Ожидайте подтверждения от заказчика.');
    }, 50);
  };

  const handleRejectSubscription = async (executorId: string) => {
    // Find executor
    const executor = allUsers.find(u => u.id === executorId);
    if (!executor) return;

    // Create notification for Executor
    const notification: Notification = {
      id: Date.now().toString(),
      type: 'warning',
      title: 'Запрос на подписку отклонен',
      message: `Заказчик ${user.name} отклонил ваш запрос на подписку.`,
      date: new Date().toISOString(),
      read: false
    };

    // Update Executor: status=none, remove request, add notification
    const updatedExecutor = {
      ...executor,
      subscriptionStatus: 'none' as const,
      subscriptionRequestToCustomerId: undefined,
      notifications: [notification, ...(executor.notifications || [])]
    };

    // Update Customer (me) to signal rejection (Self-Repair Channel)
    // We use subscriptionRequestToCustomerId on Customer as a temporary signal channel
    const updatedCustomer = {
      ...user,
      subscriptionRequestToCustomerId: `REJECTED:${executorId}`
    };

    // Update All Users
    const updatedAllUsers = allUsers.map(u => {
      if (u.id === executorId) return updatedExecutor;
      if (u.id === user.id) return updatedCustomer;
      return u;
    });

    // 1. Optimistic UI Update
    setAllUsers(updatedAllUsers);
    updateUser(updatedCustomer); // Update local user state immediately
    setTimeout(() => alert('Запрос на подписку отклонен.'), 50);

    // 2. Background DB Update
    const supabase = getSupabase();
    if (supabase) {
      resolveProfileIdColumn(supabase).then(col => {
        // We try to update Executor (might fail due to RLS) AND Customer (should succeed)
        Promise.all([
          supabase.from('profiles').update(userToProfileUpdate(updatedExecutor)).eq(col, executorId)
            .then(({ error }) => {
              if (error) console.warn('Failed to update executor profile (RLS?):', error);
            }),
          supabase.from('profiles').update(userToProfileUpdate(updatedCustomer)).eq(col, user.id)
            .then(({ error }) => {
               if (error) console.error('Failed to update customer profile:', error);
            })
        ]).then();
      });
    }
  };

  const handleConfirmSubscription = async (executorId: string) => {
    // Find executor
    const executor = allUsers.find(u => u.id === executorId);
    if (!executor) return;

    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // +30 days

    // Update Executor: status=active, dates, subscribedTo
    const updatedExecutor = {
      ...executor,
      subscriptionStatus: 'active' as const,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      subscribedToCustomerId: user.id,
      subscriptionRequestToCustomerId: undefined
    };

    // Update Customer (me)
    const updatedCustomer = {
      ...user,
      subscriptionStatus: 'active' as const,
      subscribedExecutorId: executorId
    };

    // Update All Users
    const updatedAllUsers = allUsers.map(u => {
      if (u.id === executorId) return updatedExecutor;
      if (u.id === user.id) return updatedCustomer;
      return u;
    });

    // 1. Optimistic UI Update
    setAllUsers(updatedAllUsers);
    updateUser(updatedCustomer);
    setTimeout(() => alert('Подписка подтверждена!'), 50);

    // 2. Background DB Update
    const supabase = getSupabase();
    if (supabase) {
      resolveProfileIdColumn(supabase).then(col => {
        Promise.all([
          supabase.from('profiles').update(userToProfileUpdate(updatedExecutor)).eq(col, executorId),
          supabase.from('profiles').update(userToProfileUpdate(updatedCustomer)).eq(col, user.id)
        ]).then();
      });
    }
  };

  const handleRenewSubscription = () => {
    // Reset to initial state or open modal to request again
    if (user.subscribedToCustomerId) {
      handleSubscribeRequest(user.subscribedToCustomerId);
    }
  };

  const getActiveSubscriber = (customerId: string) => {
    return allUsers.find(u => u.role === UserRole.EXECUTOR && u.subscribedToCustomerId === customerId && u.subscriptionStatus === 'active');
  };

  const handleDismissNotification = async (notificationId: string) => {
    const updatedNotifications = (user.notifications || []).filter(n => n.id !== notificationId);
    const updatedUser = { ...user, notifications: updatedNotifications };

    const updatedAllUsers = allUsers.map(u => {
      if (u.id === user.id) return updatedUser;
      return u;
    });

    setAllUsers(updatedAllUsers);
    await updateUser(updatedUser);
  };

  const handleCancelSubscription = async () => {
    if (!user.id) return;
    const supabase = getSupabase();

    // Handle Customer cancelling Executor
    if (user.role === UserRole.CUSTOMER) {
      const activeSubscriber = getActiveSubscriber(user.id);
      if (!activeSubscriber) return;

      // Create notification for Executor
      const notification: Notification = {
        id: Date.now().toString(),
        type: 'warning',
        title: 'Подписка отменена',
        message: `Заказчик ${user.name} отменил подписку.`,
        date: new Date().toISOString(),
        read: false
      };

      // Reset Executor Subscription
      const updatedExecutor = {
        ...activeSubscriber,
        subscriptionStatus: 'none' as const,
        subscribedToCustomerId: undefined,
        subscriptionStartDate: undefined,
        subscriptionEndDate: undefined,
        subscriptionRequestToCustomerId: undefined,
        notifications: [...(activeSubscriber.notifications || []), notification]
      };

      // Reset Customer Subscription (me)
      const updatedCustomer = {
        ...user,
        subscriptionStatus: 'none' as const,
        subscribedExecutorId: undefined
      };

      // 1. Optimistic UI Update - IMMEDIATELY apply changes locally
      const updatedAllUsers = allUsers.map(u => {
        if (u.id === activeSubscriber.id) return updatedExecutor;
        if (u.id === user.id) return updatedCustomer;
        return u;
      });
      setAllUsers(updatedAllUsers);
      updateUser(updatedCustomer); // Persist to local context/storage immediately
      
      // Close modal and UI feedback immediately
      setIsCancelSubscriptionModalOpen(false);
      setCancelSubscriptionReason('');
      
      // 2. Background DB Update (Don't wait for this to update UI)
      if (supabase) {
        resolveProfileIdColumn(supabase).then(col => {
          Promise.all([
            supabase.from('profiles').update(userToProfileUpdate(updatedExecutor)).eq(col, updatedExecutor.id),
            supabase.from('profiles').update(userToProfileUpdate(updatedCustomer)).eq(col, updatedCustomer.id)
          ]).then(() => {
             // Optional: Silent success log
             console.log('Subscription cancelled in DB');
          }).catch(err => {
             console.error('Error cancelling subscription in DB:', err);
             // Only revert UI if absolutely necessary, but usually better to retry or show error toast
             // For now, we trust the optimistic update
          });
        });
      }
    }
    // Handle Executor cancelling their own subscription
    else if (user.role === UserRole.EXECUTOR) {
      const customerId = user.subscribedToCustomerId;

      const customer = customerId ? allUsers.find(u => u.id === customerId) : null;

      // Reset Customer Subscription (if exists)
      let updatedCustomer = null;
      if (customer) {
        // Create notification for Customer
        const notification: Notification = {
          id: Date.now().toString(),
          type: 'warning',
          title: 'Подписка отменена',
          message: `Ваш помощник ${user.name} отменил подписку. Причина: ${cancelSubscriptionReason || 'Не указана'}`,
          date: new Date().toISOString(),
          read: false
        };

        updatedCustomer = {
          ...customer,
          subscriptionStatus: 'none' as const,
          subscribedExecutorId: undefined,
          notifications: [...(customer.notifications || []), notification]
        };
      }

      // Reset Executor Subscription (me)
      const updatedExecutor = {
        ...user,
        subscriptionStatus: 'none' as const,
        subscribedToCustomerId: undefined,
        subscriptionStartDate: undefined,
        subscriptionEndDate: undefined,
        subscriptionRequestToCustomerId: undefined
      };

      const updatedAllUsers = allUsers.map(u => {
        if (u.id === user.id) return updatedExecutor;
        if (updatedCustomer && u.id === customer.id) return updatedCustomer;
        return u;
      });

      setAllUsers(updatedAllUsers);
      updateUser(updatedExecutor);
      setIsCancelSubscriptionModalOpen(false);
      setCancelSubscriptionReason('');
      setTimeout(() => alert('Ваша подписка отменена.'), 50);

      if (supabase) {
        resolveProfileIdColumn(supabase).then(col => {
           const promises = [supabase.from('profiles').update(userToProfileUpdate(updatedExecutor)).eq(col, updatedExecutor.id)];
           if (updatedCustomer) {
             promises.push(supabase.from('profiles').update(userToProfileUpdate(updatedCustomer)).eq(col, updatedCustomer.id));
           }
           Promise.all(promises).then();
        });
      }
    }
  };

  const formatAddress = (address?: string) => {
    if (!address) return 'Адрес не указан';
    return address
      .replace(/, \d{6}/, '')
      .replace(/, Россия$/, '')
      .replace(/^Россия, /, '')
      .replace(/Россия, /, '');
  };

  const extractCity = (address?: string) => {
    if (!address) return 'Город не указан';
    const cleaned = formatAddress(address);
    const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);
    return parts[0] || cleaned;
  };

  const haversineDistanceKm = (a: Location, b: Location) => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return Math.round(R * c);
  };

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.CONFIRMED: return 'text-green-600';
      case OrderStatus.PENDING: return 'text-amber-600';
      case OrderStatus.OPEN: return 'text-careem-primary';
      case OrderStatus.COMPLETED: return 'text-careem-primary';
      case OrderStatus.CANCELLED: return 'text-red-600';
      case OrderStatus.REJECTED: return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusLabel = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.CONFIRMED: return 'Подтвержден';
      case OrderStatus.PENDING: return 'Ожидает';
      case OrderStatus.OPEN: return 'Свободен';
      case OrderStatus.COMPLETED: return 'Завершен';
      case OrderStatus.CANCELLED: return 'Отменен заказчиком';
      case OrderStatus.REJECTED: return 'Отклонен';
      default: return status;
    }
  };

  // Check for subscription expiry (mock logic)
  useEffect(() => {
    if (user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'active' && user.subscriptionEndDate) {
      const endDate = new Date(user.subscriptionEndDate);
      const now = new Date();
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

      if (daysLeft <= 0) {
        // Expired
        const updatedUser = { ...user, subscriptionStatus: 'expired' as const };
        updateUser(updatedUser);
        // Force reload logic or state update would go here
      }
    }
  }, [user]);

  // Subscription Active View for Executor - Integrated into main dashboard


  // Pending Subscription View for Executor (Optional, but good UX)
  if (user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'pending') {
    const requestedCustomer = user.subscriptionRequestToCustomerId
      ? allUsers.find(u => u.id === user.subscriptionRequestToCustomerId)
      : null;

    return (
      <div className="max-w-7xl mx-auto px-4 py-8 min-h-[80vh] flex items-center justify-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
            <i className="fas fa-clock text-3xl text-blue-500"></i>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Ожидание подтверждения</h2>
          <p className="text-gray-500">
            {requestedCustomer ? `Вы отправили запрос на подписку заказчику ${requestedCustomer.name}.` : 'Вы отправили запрос на подписку заказчику.'}
          </p>
          <p className="text-gray-500 mt-2">Заказчик должен подтвердить ваш запрос на подписку.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-in slide-in-from-right-4 duration-500">
      {/* Notifications */}
      {user.notifications && user.notifications.length > 0 && (
        <div className="mb-8 space-y-4">
          {user.notifications.map(notification => (
            <div key={notification.id} className={`p-4 rounded-xl border flex items-start justify-between ${notification.type === 'warning' ? 'bg-red-50 border-red-100 text-red-800' :
                notification.type === 'success' ? 'bg-green-50 border-green-100 text-green-800' :
                  'bg-blue-50 border-blue-100 text-blue-800'
              } animate-in slide-in-from-top-4`}>
              <div className="flex items-start gap-3">
                <i className={`fas ${notification.type === 'warning' ? 'fa-exclamation-circle' :
                    notification.type === 'success' ? 'fa-check-circle' :
                      'fa-info-circle'
                  } mt-1`}></i>
                <div>
                  <h4 className="font-bold">{notification.title}</h4>
                  <p className="text-sm opacity-90">{notification.message}</p>
                  <p className="text-xs opacity-60 mt-1">{new Date(notification.date).toLocaleString()}</p>
                </div>
              </div>
              <button
                onClick={() => handleDismissNotification(notification.id)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Active Subscription Banner for Customer */}
      {user.role === UserRole.CUSTOMER && (() => {
        const activeSubscriber = getActiveSubscriber(user.id);
        if (activeSubscriber && activeSubscriber.subscriptionEndDate) {
          const endDate = new Date(activeSubscriber.subscriptionEndDate);
          const now = new Date();
          const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

          return (
            <div className="bg-gradient-to-r from-careem-dark to-green-900 rounded-3xl p-6 mb-8 shadow-xl relative overflow-hidden text-white border border-green-800">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/20 shadow-inner shrink-0">
                    <i className="fas fa-user-shield text-3xl text-yellow-400"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-yellow-400 text-careem-dark text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider">PRO Подписка</span>
                      <span className="text-green-300 text-xs font-medium">Активна до {endDate.toLocaleDateString()}</span>
                    </div>
                    <h3 className="text-2xl font-bold mb-1">Ваш личный помощник: {activeSubscriber.name}</h3>
                    <p className="text-green-100 text-sm opacity-90">Вам помогает профессиональный ассистент. Осталось {daysLeft} дней.</p>
                  </div>
                </div>

                <button
                  onClick={() => setIsCancelSubscriptionModalOpen(true)}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold py-3 px-6 rounded-xl transition backdrop-blur-sm shrink-0 flex items-center gap-2"
                >
                  <i className="fas fa-times-circle"></i> Отменить подписку
                </button>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Pending Subscription Requests for Customer */}
      {user.role === UserRole.CUSTOMER && (
        (() => {
          const pendingRequests = allUsers.filter(u =>
            u.role === UserRole.EXECUTOR &&
            u.subscriptionStatus === 'pending' &&
            u.subscriptionRequestToCustomerId === user.id
          );

          if (pendingRequests.length === 0) return null;

          return (
            <div className="mb-6 space-y-4">
              {pendingRequests.map(requester => (
                <div key={requester.id} className="bg-white p-4 rounded-2xl shadow-lg border border-yellow-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in slide-in-from-top-4">
                  <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 shrink-0">
                      <i className="fas fa-crown"></i>
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">Запрос на подписку</h4>
                      <p className="text-sm text-gray-600">Помощник <strong>{requester.name}</strong> хочет оформить подписку.</p>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => handleRejectSubscription(requester.id)}
                      className="flex-1 sm:flex-none bg-red-50 text-red-600 font-bold py-3 sm:py-2 px-4 rounded-xl hover:bg-red-100 transition shadow-sm border border-red-100 text-center justify-center"
                    >
                      Отказать
                    </button>
                    <button
                      onClick={() => handleConfirmSubscription(requester.id)}
                      className="flex-1 sm:flex-none bg-careem-primary text-white font-bold py-3 sm:py-2 px-4 rounded-xl hover:bg-green-700 transition shadow-md text-center justify-center"
                    >
                      Подтвердить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      )}

      <div className="flex flex-col lg:flex-row gap-8">

        {/* Sidebar */}
        <div className="w-full lg:w-64 shrink-0">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <div className="text-center mb-6">
              <div className="w-20 h-20 mx-auto rounded-full overflow-hidden border-4 border-green-50 mb-4">
                <img src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}`} alt={user.name} className="w-full h-full object-cover max-w-full" />
              </div>
              <h3 className="font-bold text-gray-900">{user.name}</h3>
              <p className="text-xs text-gray-500 mb-1">{user.email}</p>
              <p className="text-xs text-careem-primary font-medium uppercase mt-1">
                {user.role === UserRole.CUSTOMER ? 'Заказчик' : 'Помощник'}
              </p>
            </div>

            <nav className="space-y-1">
              <button
                onClick={handleGoToOrders}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition relative border ${activeTab === 'orders' && !showOpenOrders ? 'bg-gradient-to-br from-careem-dark to-[#003822] text-white border-careem-dark/50 shadow-lg' : 'bg-gradient-to-br from-careem-dark/40 to-[#003822]/40 text-gray-700 border-gray-100 hover:from-careem-dark/55 hover:to-[#003822]/55 hover:shadow-md'}`}
              >
                <i className="fas fa-home mr-3"></i> Мои заказы
                {user.role === UserRole.EXECUTOR && user.subscriptionStatus !== 'active' && (executorAssignedCount > 0 || executorOpenCount > 0) && (
                  <div className="absolute top-2 right-3 flex items-center gap-1">
                    {executorAssignedCount > 0 && (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-[11px] font-bold">
                        {executorAssignedCount}
                      </span>
                    )}
                    {executorOpenCount > 0 && (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] font-bold">
                        {executorOpenCount}
                      </span>
                    )}
                  </div>
                )}
              </button>
              <button
                onClick={handleGoToProfile}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition border ${activeTab === 'profile' ? 'bg-gradient-to-br from-careem-dark to-[#003822] text-white border-careem-dark/50 shadow-lg' : 'bg-gradient-to-br from-careem-dark/40 to-[#003822]/40 text-gray-700 border-gray-100 hover:from-careem-dark/55 hover:to-[#003822]/55 hover:shadow-md'}`}
              >
                <i className="fas fa-user-circle mr-3"></i> Профиль
              </button>
              {user.role === UserRole.EXECUTOR && (
                <button
                  onClick={() => user.subscriptionStatus !== 'active' && handleTabChange('subscription')}
                  disabled={user.subscriptionStatus === 'active'}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition ${activeTab === 'subscription'
                      ? 'bg-gradient-to-br from-careem-dark to-[#003822] text-white border border-careem-dark/50 shadow-lg'
                      : user.subscriptionStatus === 'active'
                        ? 'text-gray-400 cursor-not-allowed opacity-50 bg-gray-50 border border-gray-100'
                        : 'bg-gradient-to-br from-careem-dark/40 to-[#003822]/40 text-gray-700 border border-gray-100 hover:from-careem-dark/55 hover:to-[#003822]/55 hover:shadow-md'
                    }`}
                >
                  <i className="fas fa-rocket mr-3"></i> Продвижение
                </button>
              )}

              <button
                onClick={() => setIsDeleteModalOpen(true)}
                className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition mt-2"
              >
                <i className="fas fa-trash-alt mr-3"></i> Удалить профиль
              </button>
            </nav>
          </div>

          {user.role === UserRole.CUSTOMER && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
              <h4 className="font-bold text-gray-900">Инструкция</h4>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                Простые шаги, чтобы оформить заявку и отслеживать выполнение.
              </p>

              <div className="mt-4 space-y-2">
                <details className="rounded-xl border border-gray-100 bg-gray-50/60">
                  <summary className="cursor-pointer list-none px-4 py-3 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-green-100 text-careem-primary flex items-center justify-center shrink-0">
                      <i className="fas fa-id-card"></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">Войдите или зарегистрируйтесь</p>
                      <p className="mt-1 text-xs text-gray-500">Выберите роль: заказчик.</p>
                    </div>
                  </summary>
                  <div className="px-4 pb-4 text-xs text-gray-600 leading-relaxed">
                    После входа вам станет доступен личный кабинет, история заявок и создание новых заказов.
                  </div>
                </details>

                <details className="rounded-xl border border-gray-100 bg-gray-50/60">
                  <summary className="cursor-pointer list-none px-4 py-3 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-green-100 text-careem-primary flex items-center justify-center shrink-0">
                      <i className="fas fa-clipboard-list"></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">Опишите задачу</p>
                      <p className="mt-1 text-xs text-gray-500">Что нужно сделать, когда и где.</p>
                    </div>
                  </summary>
                  <div className="px-4 pb-4 text-xs text-gray-600 leading-relaxed">
                    Укажите время, длительность и особые требования (коляска, лифт, помощь с сумками).
                  </div>
                </details>

                <details className="rounded-xl border border-gray-100 bg-gray-50/60">
                  <summary className="cursor-pointer list-none px-4 py-3 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-green-100 text-careem-primary flex items-center justify-center shrink-0">
                      <i className="fas fa-map-location-dot"></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">Укажите маршрут</p>
                      <p className="mt-1 text-xs text-gray-500">Адреса и удобный формат на карте.</p>
                    </div>
                  </summary>
                  <div className="px-4 pb-4 text-xs text-gray-600 leading-relaxed">
                    Для трансфера добавьте точку А и точку Б. Для встречи достаточно одной точки и ориентира.
                  </div>
                </details>

                <details className="rounded-xl border border-gray-100 bg-gray-50/60">
                  <summary className="cursor-pointer list-none px-4 py-3 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-green-100 text-careem-primary flex items-center justify-center shrink-0">
                      <i className="fas fa-circle-check"></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">Следите за статусом</p>
                      <p className="mt-1 text-xs text-gray-500">Подтверждение, выполнение и завершение заявки.</p>
                    </div>
                  </summary>
                  <div className="px-4 pb-4 text-xs text-gray-600 leading-relaxed">
                    В кабинете видно, на каком этапе заявка: ожидает отклика, в работе, завершена или отменена.
                  </div>
                </details>
              </div>
            </div>
          )}

          <div className="bg-gradient-to-br from-careem-dark to-[#003822] p-6 rounded-2xl text-white shadow-xl overflow-hidden relative group border border-careem-dark/50">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10 shadow-inner">
                  <i className="fab fa-telegram text-2xl text-white"></i>
                </div>
                <div>
                  <h4 className="font-bold text-lg leading-tight">Telegram Бот</h4>
                  <p className="text-[10px] text-green-200 font-medium uppercase tracking-wider opacity-80">Уведомления 24/7</p>
                </div>
              </div>

              {user.subscriptionStatus === 'active' ? (
                <>
                  <p className="text-sm text-green-50 mb-6 leading-relaxed opacity-90 font-light">
                    Для обсуждения и передачи данных вы можете связаться через телеграмм.
                  </p>

                  <button
                    onClick={() => {
                      const counterpart = user.role === UserRole.EXECUTOR
                        ? allUsers.find(u => u.id === user.subscribedToCustomerId)
                        : allUsers.find(u => u.id === user.subscribedExecutorId);

                      if (counterpart?.telegramId) {
                        window.open(`https://t.me/${counterpart.telegramId.replace('@', '')}`, '_blank');
                      } else if (counterpart?.phone) {
                        window.open(`https://t.me/+${counterpart.phone.replace(/[^0-9]/g, '')}`, '_blank');
                      } else {
                        window.open('https://t.me/', '_blank');
                      }
                    }}
                    className="w-full bg-white text-careem-dark text-sm font-bold py-3.5 rounded-xl transition-all transform hover:scale-[1.02] hover:shadow-lg hover:bg-green-50 flex items-center justify-center gap-2 group-hover:gap-3"
                  >
                    <i className="fab fa-telegram text-lg"></i>
                    <span>Написать</span>
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-green-50 mb-6 leading-relaxed opacity-90 font-light">
                    Получайте мгновенные уведомления о новых заказах и изменениях статуса прямо в мессенджер.
                  </p>

                  <button className="w-full bg-white text-careem-dark text-sm font-bold py-3.5 rounded-xl transition-all transform hover:scale-[1.02] hover:shadow-lg hover:bg-green-50 flex items-center justify-center gap-2 group-hover:gap-3">
                    <i className="fab fa-telegram text-lg"></i>
                    <span>{user.telegramId ? 'Настройки бота' : 'Подключить сейчас'}</span>
                  </button>
                </>
              )}
            </div>

            {/* Decorative background effects */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-400/20 rounded-full blur-3xl -mr-10 -mt-10"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-careem-accent/10 rounded-full blur-2xl -ml-10 -mb-10"></div>
            <i className="fab fa-telegram absolute -bottom-6 -right-6 text-[9rem] opacity-5 transform rotate-12 group-hover:rotate-0 group-hover:scale-110 transition duration-700 ease-out"></i>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-grow">
          {activeTab === 'orders' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 ref={ordersHeaderRef} className="text-2xl font-bold text-slate-100">
                  {showOpenOrders ? 'Доступные заказы' : user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'active' ? 'Статус подписки' : 'Мои заказы'}
                </h2>
                {!(user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'active') || showOpenOrders ? (
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs font-semibold text-slate-200 hover:bg-white/10 transition">Фильтры</button>
                  </div>
                ) : null}
              </div>

              {user.role === UserRole.EXECUTOR && openOrders.length > 0 && !showOpenOrders && orders.every(o => o.status !== OrderStatus.CONFIRMED) && (
                <div
                  onClick={() => {
                    navigate('/orders/open');
                  }}
                  className="bg-[#0B1220]/60 border border-white/10 p-4 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-white/5 transition shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#13213A] rounded-2xl flex items-center justify-center text-careem-primary border border-[#1B2D4F]">
                      <i className="fas fa-bell"></i>
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-100">Доступны новые заказы</h4>
                      <p className="text-xs text-slate-400">Всего {openOrders.length} заказов ожидают исполнителя</p>
                    </div>
                  </div>
                  <div className="w-9 h-9 bg-white/5 rounded-2xl flex items-center justify-center text-slate-200 border border-white/10">
                    <i className="fas fa-chevron-right"></i>
                  </div>
                </div>
              )}



              {user.role === UserRole.EXECUTOR && showOpenOrders && (
                <button
                  onClick={() => {
                    setShowOpenOrders(false);
                    navigate('/dashboard');
                  }}
                  className="mb-4 text-sm text-slate-400 hover:text-slate-100 flex items-center gap-2 transition"
                >
                  <i className="fas fa-arrow-left"></i> Назад к моим заказам
                </button>
              )}

              {user.role === UserRole.EXECUTOR && !showOpenOrders && user.subscriptionStatus === 'active' && user.subscriptionEndDate ? (
                (() => {
                  const endDate = new Date(user.subscriptionEndDate);
                  const now = new Date();
                  const diffTime = Math.abs(endDate.getTime() - now.getTime());
                  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                  return (
                    <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 w-full text-center relative overflow-hidden animate-in slide-in-from-bottom-4">
                      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-400 to-yellow-600"></div>

                      <div className="w-24 h-24 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                        <i className="fas fa-crown text-4xl text-yellow-500"></i>
                      </div>

                      <h2 className="text-2xl font-black text-gray-900 mb-2">Подписка активна</h2>
                      <p className="text-gray-500 mb-8">Вы успешно подписаны на заказчика. Доступ к общей ленте заказов ограничен.</p>

                      <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 mb-8 max-w-md mx-auto">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Истекает через</p>
                        <div className="text-4xl font-black text-careem-primary mb-1">
                          {daysLeft} <span className="text-lg text-gray-400 font-medium">дней</span>
                        </div>
                        <p className="text-xs text-gray-400">Дата окончания: {endDate.toLocaleDateString()}</p>
                      </div>

                      <div className="max-w-md mx-auto mb-6">
                        <button
                          onClick={() => setIsCancelSubscriptionModalOpen(true)}
                          className="w-full bg-white border-2 border-red-100 text-red-500 font-bold py-3 rounded-xl hover:bg-red-50 transition flex items-center justify-center gap-2"
                        >
                          <i className="fas fa-times-circle"></i>
                          Отменить подписку
                        </button>
                      </div>

                      {daysLeft <= 1 && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 max-w-md mx-auto">
                          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-bold mb-4 border border-red-100">
                            <i className="fas fa-exclamation-circle mr-2"></i>
                            Подписка скоро истекает!
                          </div>
                          <button
                            onClick={handleRenewSubscription}
                            className="w-full bg-careem-primary text-white font-bold py-3 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-200"
                          >
                            Сделать новый запрос заказчику
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : user.role === UserRole.CUSTOMER && user.subscriptionStatus === 'active' ? (
                <div className="bg-white p-12 rounded-2xl border border-green-100 text-center shadow-sm">
                  <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i className="fas fa-user-check text-4xl text-green-500"></i>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">У вас есть личный помощник</h3>
                  <p className="text-gray-500 max-w-md mx-auto">Ваши заказы и задачи теперь управляются через персонального ассистента. Вся информация о работе доступна через прямую связь.</p>
                </div>
              ) : activeOrders.length > 0 || completedOrders.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {/* Active Orders */}
                  {activeOrders.map(order => (
                    <div key={order.id} className="p-0 rounded-3xl shadow-[0_0_40px_rgba(255,255,255,0.05)] border-0 overflow-hidden transition duration-300 backdrop-blur-xl">
                      {/* Inner Card Container with Inner Shadow */}
                      <div className="m-0 p-6 rounded-3xl bg-[#0B1220]/80 border border-white/10 relative shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">

                        {/* Header: Icon + Type + Date */}
                        <div className="flex justify-between items-start mb-6">
                          <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${user.role === UserRole.EXECUTOR && order.executorId === user.id ? 'bg-careem-primary/15 text-careem-primary border-careem-primary/20' : 'bg-[#13213A] text-careem-primary border-[#1B2D4F]'}`}>
                              <i className="fas fa-hand-holding-heart text-2xl"></i>
                            </div>
                            <div>
                              <h4 className="font-extrabold text-slate-100 text-lg leading-tight">{order.serviceType}</h4>
                              <p className="text-xs font-medium text-slate-400 mt-1 flex items-center gap-2">
                                <span className="bg-white/5 px-2 py-0.5 rounded border border-white/10 text-slate-300">{order.date}</span>
                                <span className="text-slate-300">{order.time}</span>
                              </p>
                            </div>
                          </div>
                          <span
                            className={[
                              'absolute top-3 right-3 text-[9px] leading-none font-black uppercase tracking-wide whitespace-nowrap drop-shadow-[0_6px_18px_rgba(0,0,0,0.55)]',
                              getStatusColor(order.status),
                              order.status === OrderStatus.PENDING ? 'animate-pulse' : ''
                            ].join(' ')}
                          >
                            {getStatusLabel(order.status)}
                          </span>
                        </div>

                        {/* Body: Price & Info */}
                        <div className="flex items-center justify-between bg-white/5 rounded-2xl p-4 border border-white/10">
                          <div>
                            <p className="text-[10px] uppercase text-slate-400 font-bold mb-1 tracking-wider">Стоимость услуги</p>
                            <p className="text-2xl font-black text-slate-100">{order.totalPrice} <span className="text-sm font-medium text-slate-400">₽</span></p>
                          </div>
                          <div className="h-8 w-px bg-white/10 mx-4"></div>
                          <div className="text-right">
                            <button
                              onClick={() => setSelectedOrderDetails(order)}
                              className="text-xs font-bold text-careem-primary hover:text-white transition flex items-center gap-1 group"
                            >
                              Подробнее <i className="fas fa-arrow-right transform group-hover:translate-x-1 transition-transform"></i>
                            </button>
                          </div>
                        </div>

                        {/* Visual Distinction for CONFIRMED Orders (Executor) */}
                        {user.role === UserRole.EXECUTOR && order.status === OrderStatus.CONFIRMED && (
                          <div className="mt-4 p-4 bg-green-900/20 border border-green-500/30 rounded-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-full blur-2xl -mr-8 -mt-8"></div>
                            <div className="relative z-10">
                                <h5 className="text-green-400 font-bold text-sm mb-2 flex items-center gap-2">
                                  <i className="fas fa-check-circle"></i> Заказ взят в работу
                                </h5>
                                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mb-2">Ваши действия:</p>
                                 <ul className="text-xs text-slate-300 space-y-2">
                                   <li className="flex items-start gap-2">
                                     <span className="bg-white/10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">1</span>
                                     <span>Свяжитесь с заказчиком</span>
                                   </li>
                                   <li className="flex items-start gap-2">
                                     <span className="bg-white/10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">2</span>
                                     <span>Выполните услугу</span>
                                   </li>
                                   <li className="flex items-start gap-2">
                                     <span className="bg-white/10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">3</span>
                                     <span>Дождитесь "Подтвердить выполнение" заказчиком</span>
                                   </li>
                                 </ul>
                               </div>
                            </div>
                          </div>
                        )}

                        {/* Actions Footer */}
                        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/10">
                          {user.role === UserRole.EXECUTOR && order.status === OrderStatus.PENDING && (
                            <>
                              <button onClick={() => handleUpdateOrderStatus(order.id, OrderStatus.CONFIRMED)} className="flex-1 bg-careem-primary text-white py-2.5 rounded-2xl hover:bg-[#255EE6] transition font-bold text-sm shadow-lg shadow-[#2D6BFF]/20" title="Подтвердить">
                                <i className="fas fa-check mr-2"></i> Принять
                              </button>
                              <button onClick={() => setRejectingOrderId(order.id)} className="flex-1 bg-white/5 text-red-300 border border-red-500/20 py-2.5 rounded-2xl hover:bg-red-500/10 transition font-bold text-sm" title="Отклонить">
                                <i className="fas fa-times mr-2"></i> Отклонить
                              </button>
                            </>
                          )}

                          {user.role === UserRole.EXECUTOR && order.status === OrderStatus.OPEN && (
                            <button
                              onClick={() => handleTakeOpenOrder(order.id)}
                              className="flex-1 py-3 rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 bg-careem-primary text-white hover:bg-[#255EE6] shadow-lg shadow-[#2D6BFF]/20"
                            >
                              <i className="fas fa-hand-point-up"></i> Взять в работу
                            </button>
                          )}

                          {user.role === UserRole.CUSTOMER && order.status === OrderStatus.PENDING && (
                            (() => {
                              const executor = allUsers.find(u => u.id === order.executorId);
                              const hasSubscriptionRequest = executor?.subscriptionRequestToCustomerId === user.id;

                              if (hasSubscriptionRequest && executor) {
                                return (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (window.confirm(`Подтвердить подписку от ${executor.name} и удалить этот заказ?`)) {
                                        await handleConfirmSubscription(executor.id);
                                        await handleDeleteOrder(order.id);
                                      }
                                    }}
                                    className="w-full bg-careem-primary text-white border border-careem-primary py-2.5 rounded-xl hover:bg-green-700 transition font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-green-200"
                                    title="Подтвердить подписку"
                                  >
                                    <i className="fas fa-user-check"></i> Запрос на подписку от {executor.name}
                                  </button>
                                );
                              }

                              return (
                                <button
                                  onClick={async () => {
                                    if (window.confirm('Вы уверены, что хотите отменить этот заказ и удалить его?')) {
                                      await handleDeleteOrder(order.id);
                                    }
                                  }}
                                  className="w-full bg-red-50 text-red-600 border border-red-100 py-2.5 rounded-xl hover:bg-red-100 transition font-bold text-sm flex items-center justify-center gap-2"
                                  title="Отменить и удалить"
                                >
                                  <i className="fas fa-times"></i> Отменить запрос к помощнику
                                </button>
                              );
                            })()
                          )}

                          {user.role === UserRole.CUSTOMER && order.status === OrderStatus.CONFIRMED && (
                            <button
                              onClick={() => setCompletingOrderId(order.id)}
                              className="w-full bg-green-600 text-white py-3 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-200 font-bold text-sm flex items-center justify-center gap-2"
                            >
                              <i className="fas fa-check-circle"></i> Подтвердить выполнение
                            </button>
                          )}

                          {/* Delete Button (Trash Icon) for Customer */}
                          {user.role === UserRole.CUSTOMER && (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REJECTED || order.status === OrderStatus.COMPLETED) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Вы уверены, что хотите удалить этот заказ из истории?')) {
                                  handleDeleteOrder(order.id);
                                }
                              }}
                              className="ml-auto w-10 h-10 flex items-center justify-center bg-white/5 text-slate-400 hover:text-red-300 hover:bg-red-500/10 rounded-2xl transition border border-white/10"
                              title="Удалить заказ"
                            >
                              <i className="fas fa-trash-alt"></i>
                            </button>
                          )}
                        </div>

                        {/* Expanded Content Area (Audio, etc.) */}
                        <div className="space-y-4 mt-2">
                          {order.status === OrderStatus.REJECTED && order.rejectionReason && (
                            <div className="mt-2 w-full">
                              <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-800">
                                <strong>Причина отказа:</strong> {order.rejectionReason}
                              </div>
                            </div>
                          )}

                          {/* Voice Message Player */}
                          {order.voiceMessageUrl && (
                            <div className="w-full mt-3 p-3 bg-white/5 rounded-2xl border border-white/10">
                              <p className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-2">
                                <i className="fas fa-microphone text-red-500"></i> Голосовое сообщение
                              </p>
                              <audio src={order.voiceMessageUrl} controls className="w-full h-8" />
                            </div>
                          )}

                          {/* Customer Info for Executor */}
                          {user.role === UserRole.EXECUTOR && (

                            (() => {
                              const customer = allUsers.find(u => u.id === order.customerId);
                              if (!customer) return null;
                              return (
                                <div
                                  onClick={() => setViewingCustomer(customer)}
                                  className="w-full mt-4 p-4 bg-white/5 rounded-2xl border border-white/10 cursor-pointer hover:bg-white/10 transition group"
                                >
                                  <div className="flex items-center gap-4">
                                    <div className="shrink-0">
                                      <img
                                        src={customer.avatar || `https://ui-avatars.com/api/?name=${customer.name}`}
                                        alt={customer.name}
                                        className="w-12 h-12 rounded-2xl object-cover border border-white/10 shadow-sm"
                                      />
                                    </div>
                                    <div className="flex-grow">
                                      <h5 className="font-bold text-slate-300 text-sm">Заказчик</h5>
                                      <h4 className="font-bold text-slate-100 text-base group-hover:text-careem-primary transition">{customer.name}</h4>
                                      {customer.phone && (
                                        <span className="text-xs text-careem-primary font-medium mt-1 inline-block">
                                          Нажмите, чтобы увидеть профиль
                                        </span>
                                      )}
                                    </div>
                                    <div className="w-9 h-9 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-careem-primary border border-white/10 transition">
                                      <i className="fas fa-chevron-right"></i>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()
                          )}

                          {/* Executor Info for Customer - Full Details */}
                          {user.role === UserRole.CUSTOMER && order.executorId && (
                            (() => {
                              const executor = allUsers.find(u => u.id === order.executorId);
                              if (!executor) return null;
                              return (
                                <div className="w-full mt-4 p-4 bg-white/5 rounded-2xl border border-white/10 animate-in fade-in duration-500">
                                  <div className="flex items-center justify-between mb-3">
                                    <h5 className="font-bold text-sm text-slate-300">Исполнитель назначен</h5>
                                    <span className={`text-xs font-black uppercase tracking-wide ${getStatusColor(order.status)}`}>
                                      {getStatusLabel(order.status)}
                                    </span>
                                  </div>

                                  <div className="flex flex-col sm:flex-row gap-4">
                                    <div className="shrink-0 relative">
                                      <img
                                        src={executor.avatar || `https://ui-avatars.com/api/?name=${executor.name}`}
                                        alt={executor.name}
                                        className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md max-w-full"
                                      />
                                      {(realRatings[executor.id] || executor.rating) && (
                                        <div className="absolute -bottom-2 -right-2 bg-white px-1.5 py-0.5 rounded-lg shadow-sm border border-gray-100 flex items-center gap-1">
                                          <i className="fas fa-star text-yellow-400 text-[10px]"></i>
                                          <span className="text-xs font-bold text-gray-700">{realRatings[executor.id] || executor.rating}</span>
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex-grow">
                                      <h4 className="font-bold text-slate-100 text-lg leading-tight mb-1">{executor.name}</h4>

                                      {executor.description && (
                                        <p className="text-xs text-slate-300 mb-2 line-clamp-2">{executor.description}</p>
                                      )}

                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {executor.phone && (
                                          <a href={`tel:${executor.phone}`} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:text-careem-primary hover:border-green-300 transition">
                                            <i className="fas fa-phone text-careem-primary"></i>
                                            {executor.phone}
                                          </a>
                                        )}
                                        <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:text-careem-primary hover:border-green-300 transition">
                                          <i className="fab fa-telegram text-careem-primary"></i>
                                          Сообщение
                                        </button>
                                      </div>
                                    </div>

                                    {executor.vehiclePhoto && order.serviceType === 'Транспортировка на авто' && (
                                      <div className="shrink-0">
                                        <img src={executor.vehiclePhoto} alt="Транспорт" className="w-20 h-16 object-cover rounded-lg border border-gray-200 max-w-full" />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()
                          )}

                          {/* Customer View: Responses */}
                          {user.role === UserRole.CUSTOMER && order.status === OrderStatus.OPEN && order.responses && order.responses.length > 0 && (
                            <div className="w-full mt-4">
                              <h5 className="font-bold text-sm text-gray-900 mb-3">Отклики исполнителей ({order.responses.length})</h5>
                              <div className="space-y-3">
                                {order.responses.map(responderId => {
                                  const responder = allUsers.find(u => u.id === responderId);
                                  if (!responder) return null;
                                  // Hide responder if they are subscribed to someone else
                                  if (responder.subscriptionStatus === 'active' && responder.subscribedToCustomerId !== user.id) return null;

                                  return (
                                    <div key={responderId} className="flex items-center justify-between p-3 bg-careem-light rounded-xl border border-green-100">
                                      <div className="flex items-center gap-3">
                                        <img src={responder.avatar || `https://ui-avatars.com/api/?name=${responder.name}`} alt={responder.name} className="w-10 h-10 rounded-full object-cover max-w-full" />
                                        <div>
                                          <p className="font-bold text-sm text-gray-900">{responder.name}</p>
                                          <div className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded-lg shadow-sm border border-gray-100 mt-1 w-fit">
                                            <i className="fas fa-star text-yellow-400 text-[10px]"></i>
                                            <span className="text-xs font-bold text-gray-700">{realRatings[responder.id] || responder.rating || '0.0'}</span>
                                          </div>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => handleSelectExecutor(order.id, responderId)}
                                        className="bg-careem-primary text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-green-700 transition"
                                      >
                                        Выбрать
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Order Details */}
                        {order.details && (
                          <div className="mt-4 pt-4 border-t border-white/10">
                            <h5 className="text-xs font-bold text-slate-400 uppercase mb-2">Детали заказа</h5>
                            <p className="text-sm text-slate-300">{order.details}</p>
                          </div>
                        )}

                        {/* Address Information - Moved to Details Modal */}

                        {/* Order Map Visualization Removed */}
                      </div>
                    </div>
                  ))}

                  {/* Completed Orders (Collapsed/History) */}
                  {completedOrders.length > 0 && (
                    <div className="mt-8">
                      <h3 className="text-lg font-bold text-gray-500 mb-4 px-2 uppercase tracking-wider text-xs">История заказов</h3>
                      <div className="space-y-3">
                        {completedOrders.map(order => (
                          <div key={order.id} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                            <div
                              onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                              className="p-4 flex flex-col md:flex-row md:items-center justify-between cursor-pointer hover:bg-gray-100 transition gap-4"
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 shrink-0">
                                  <i className="fas fa-check"></i>
                                </div>
                                <div className="min-w-0">
                                  <h4 className="font-bold text-gray-700 text-sm truncate">{order.serviceType}</h4>
                                  <p className="text-xs text-gray-500">{order.date}</p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto">
                                <div className="flex items-center gap-4">
                                  <span className="text-sm font-bold text-gray-600 whitespace-nowrap">{order.totalPrice} ₽</span>
                                  <span className={`text-[11px] leading-none font-black uppercase tracking-wide whitespace-nowrap ${getStatusColor(order.status)}`}>
                                    {getStatusLabel(order.status)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {user.role === UserRole.CUSTOMER && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm('Вы уверены, что хотите удалить этот заказ из истории?')) {
                                          handleDeleteOrder(order.id);
                                        }
                                      }}
                                      className="w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0"
                                      title="Удалить заказ"
                                    >
                                      <i className="fas fa-trash-alt"></i>
                                    </button>
                                  )}
                                  <i className={`fas fa-chevron-down text-gray-400 transition-transform shrink-0 ${expandedOrderId === order.id ? 'rotate-180' : ''}`}></i>
                                </div>
                              </div>
                            </div>

                            {expandedOrderId === order.id && (
                              <div className="p-4 pt-0 border-t border-gray-200 bg-white">
                                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">Детали заказа</p>
                                    <p className="text-sm text-gray-800">{order.details || 'Нет деталей'}</p>
                                  </div>
                                  {order.rating && (
                                    <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                                      {user.role === UserRole.CUSTOMER && (
                                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Ваша оценка помощнику</p>
                                      )}
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className="flex text-yellow-400 text-sm">
                                          {[...Array(5)].map((_, i) => (
                                            <i key={i} className={`fas fa-star ${i < order.rating! ? '' : 'text-gray-200'}`}></i>
                                          ))}
                                        </div>
                                        <span className="font-bold text-sm text-gray-900">{order.rating}/5</span>
                                      </div>
                                      {order.review && (
                                        <p className="text-sm text-gray-700 italic">"{order.review}"</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {/* Customer/Executor Info in History */}
                                <div className="mt-4 pt-4 border-t border-gray-100">
                                  {user.role === UserRole.EXECUTOR ? (
                                    // Show Customer info
                                    (() => {
                                      const customer = allUsers.find(u => u.id === order.customerId);
                                      if (!customer) return null;
                                      return (
                                        <div className="flex items-center gap-3">
                                          <img src={customer.avatar || `https://ui-avatars.com/api/?name=${customer.name}`} alt={customer.name} className="w-8 h-8 rounded-full" />
                                          <div>
                                            <p className="text-xs font-bold text-gray-900">{customer.name}</p>
                                            <p className="text-[10px] text-gray-500">Заказчик</p>
                                          </div>
                                        </div>
                                      );
                                    })()
                                  ) : (
                                    // Show Executor info
                                    (() => {
                                      const executor = allUsers.find(u => u.id === order.executorId);
                                      if (!executor) return null;
                                      return (
                                        <div className="flex items-center gap-3">
                                          <img src={executor.avatar || `https://ui-avatars.com/api/?name=${executor.name}`} alt={executor.name} className="w-8 h-8 rounded-full" />
                                          <div>
                                            <p className="text-xs font-bold text-gray-900">{executor.name}</p>
                                            <p className="text-[10px] text-gray-500">Помощник</p>
                                          </div>
                                        </div>
                                      );
                                    })()
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : isOrdersLoading ? (
                <div className="bg-white p-12 rounded-2xl border border-dashed border-gray-300 text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-careem-primary mx-auto mb-4"></div>
                  <p className="text-gray-500">Идет обновление базы активных заказов...</p>
                </div>
              ) : (
                <div className="bg-white p-12 rounded-2xl border border-dashed border-gray-300 text-center">
                  <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i className="fas fa-folder-open text-4xl text-gray-300"></i>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Активных заказов нет</h3>
                  <p className="text-gray-500">На данный момент список заказов пуст.</p>
                </div>
              )}
            </div>
          )}

          {/* Order Details Modal */}
          {selectedOrderDetails && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200 modal-open">
              <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Детали заказа</h3>
                    <p className="text-sm text-gray-500 mt-1">{selectedOrderDetails.serviceType}</p>
                  </div>
                  <button
                    onClick={() => setSelectedOrderDetails(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition shadow-sm"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar">
                  {/* Status & Price */}
                  <div className="flex items-center justify-between mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <div>
                      <p className="text-xs text-careem-primary font-bold uppercase mb-1">Стоимость</p>
                      <p className="text-2xl font-bold text-careem-dark">{selectedOrderDetails.totalPrice} ₽</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-careem-primary font-bold uppercase mb-1">Статус</p>
                      <span
                        className={[
                          'text-[11px] leading-none font-black uppercase tracking-wide whitespace-nowrap',
                          getStatusColor(selectedOrderDetails.status),
                          selectedOrderDetails.status === OrderStatus.PENDING ? 'animate-pulse' : ''
                        ].join(' ')}
                      >
                        {getStatusLabel(selectedOrderDetails.status)}
                      </span>
                    </div>
                  </div>

                  {/* Date & Time */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-xs text-gray-400 font-bold uppercase mb-1">Дата</p>
                      <p className="font-bold text-gray-900 flex items-center gap-2">
                        <i className="fas fa-calendar-alt text-careem-primary"></i>
                        {selectedOrderDetails.date}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-xs text-gray-400 font-bold uppercase mb-1">Время</p>
                      <p className="font-bold text-gray-900 flex items-center gap-2">
                        <i className="fas fa-clock text-careem-primary"></i>
                        {selectedOrderDetails.time}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  {selectedOrderDetails.details && (
                    <div className="mb-6">
                      <h4 className="text-sm font-bold text-gray-900 mb-2">Описание задачи</h4>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-gray-700 text-sm leading-relaxed">
                        {selectedOrderDetails.details}
                      </div>
                    </div>
                  )}

                  {/* Route / Address */}
                  <div className="mb-6">
                    <h4 className="text-sm font-bold text-gray-900 mb-2">Маршрут и адрес</h4>
                    {selectedOrderDetails.locationFrom && selectedOrderDetails.locationTo ? (
                      <>
                        <OrderMap order={selectedOrderDetails} hideInfo />
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                            <p className="text-[11px] font-bold uppercase text-gray-400 mb-1">Откуда</p>
                            <p className="text-gray-800">
                              {formatAddress(selectedOrderDetails.locationFrom.address)}
                            </p>
                          </div>
                          <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                            <p className="text-[11px] font-bold uppercase text-gray-400 mb-1">Куда</p>
                            <p className="text-gray-800">
                              {formatAddress(selectedOrderDetails.locationTo.address)}
                            </p>
                          </div>
                        </div>
                      </>
                    ) : selectedOrderDetails.generalLocation ? (
                      <>
                        <OrderMap order={selectedOrderDetails} hideInfo />
                        <div className="mt-3 bg-gray-50 rounded-xl border border-gray-100 p-3 text-sm">
                          <p className="text-[11px] font-bold uppercase text-gray-400 mb-1">Адрес</p>
                          <p className="text-gray-800">
                            {formatAddress(selectedOrderDetails.generalLocation.address)}
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Адрес уточняется у заказчика</p>
                    )}
                  </div>
                </div>

                {user.role !== UserRole.CUSTOMER && (
                  <div className="p-6 border-t border-gray-100 bg-gray-50">
                    <button
                      onClick={() => setSelectedOrderDetails(null)}
                      className="w-full bg-careem-primary text-white font-bold py-3 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-100"
                    >
                      Закрыть
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rejection Modal */}
          {rejectingOrderId && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-open">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Укажите причину отказа</h3>
                <textarea
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-careem-primary mb-4 h-32 resize-none text-gray-900 placeholder-gray-400"
                  placeholder="Например: занят в это время, не оказываю данную услугу..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  autoFocus
                ></textarea>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setRejectingOrderId(null);
                      setRejectionReason('');
                    }}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleRejectOrder}
                    disabled={!rejectionReason.trim()}
                    className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Отклонить заказ
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Completion & Review Modal */}
          {completingOrderId && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200 modal-open">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl scale-100">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 mx-auto mb-4">
                    <i className="fas fa-check text-2xl"></i>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Заказ выполнен!</h3>
                  <p className="text-sm text-gray-500 mt-1">Пожалуйста, оцените работу помощника</p>
                </div>

                <div className="mb-6">
                  <div className="flex justify-center gap-2 mb-4">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        className={`text-3xl transition ${star <= reviewRating ? 'text-yellow-400 scale-110' : 'text-gray-300 hover:text-yellow-200'}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>

                  <textarea
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-green-500 min-h-[100px] resize-none text-sm text-gray-900 placeholder-gray-400"
                    placeholder="Напишите пару слов о работе специалиста..."
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                  ></textarea>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setCompletingOrderId(null);
                      setReviewRating(5);
                      setReviewText('');
                    }}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  >
                    Позже
                  </button>
                  <button
                    onClick={handleCompleteOrder}
                    className="px-6 py-2 bg-careem-primary text-white font-bold rounded-lg hover:bg-green-700 transition shadow-lg shadow-green-200"
                  >
                    Отправить отзыв
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Customer Details Modal */}
          {viewingCustomer && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200 modal-open">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl scale-100 relative overflow-hidden">
                <button
                  onClick={() => setViewingCustomer(null)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition z-10"
                >
                  <i className="fas fa-times text-xl"></i>
                </button>

                <div className="text-center mb-6 pt-4">
                  <div className="w-24 h-24 mx-auto rounded-full overflow-hidden border-4 border-green-50 mb-4 shadow-lg">
                    <img
                      src={viewingCustomer.avatar || `https://ui-avatars.com/api/?name=${viewingCustomer.name}`}
                      alt={viewingCustomer.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">{viewingCustomer.name}</h3>
                  <p className="text-careem-primary font-medium text-sm mt-1">Заказчик</p>
                </div>

                <div className="space-y-4 bg-gray-50 rounded-xl p-4 mb-6">
                  {viewingCustomer.phone && (
                    <div className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-careem-primary shrink-0">
                        <i className="fas fa-phone"></i>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-bold">Телефон</p>
                        <a href={`tel:${viewingCustomer.phone}`} className="text-gray-900 font-medium hover:text-careem-primary">
                          {viewingCustomer.phone}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Removed Email Field for Executor */}

                  {viewingCustomer.location && (
                    <div className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-careem-primary shrink-0">
                        <i className="fas fa-map-marker-alt"></i>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-bold">Адрес / Район</p>
                        <p className="text-gray-900 font-medium">{viewingCustomer.location}</p>
                      </div>
                    </div>
                  )}

                  {viewingCustomer.description && (
                    <div className="p-3 bg-white rounded-lg shadow-sm">
                      <p className="text-xs text-gray-500 uppercase font-bold mb-2">О себе / Примечания</p>
                      <p className="text-gray-700 text-sm leading-relaxed">{viewingCustomer.description}</p>
                    </div>
                  )}
                </div>

                {/* Actions for Executor viewing Customer */}
                <div className="grid grid-cols-2 gap-3">
                  {viewingCustomer.phone && (
                    <a
                      href={`tel:${viewingCustomer.phone}`}
                      className="col-span-2 flex items-center justify-center gap-2 py-3 bg-careem-primary text-white rounded-xl font-bold hover:bg-green-700 transition"
                    >
                      <i className="fas fa-phone"></i> Позвонить
                    </a>
                  )}
                  <button className="flex items-center justify-center gap-2 py-3 bg-careem-primary text-white rounded-xl font-bold hover:bg-careem-dark transition">
                    <i className="fab fa-telegram"></i> Написать
                  </button>

                  {/* Subscription Button */}
                  {(() => {
                    const existingSubscriber = allUsers.find(u => u.subscribedToCustomerId === viewingCustomer.id && u.subscriptionStatus === 'active');
                    const isSubscribedBySomeoneElse = existingSubscriber && existingSubscriber.id !== user.id;

                    return (
                      <button
                        onClick={() => handleSubscribeRequest(viewingCustomer.id)}
                        disabled={user.subscriptionStatus === 'pending' || user.subscriptionStatus === 'active' || !!isSubscribedBySomeoneElse}
                        className="flex items-center justify-center gap-2 py-3 bg-yellow-400 text-gray-900 rounded-xl font-bold hover:bg-yellow-500 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
                        title={isSubscribedBySomeoneElse ? 'У пользователя уже есть активный помощник' : ''}
                      >
                        <i className="fas fa-crown"></i>
                        {user.subscriptionStatus === 'pending' ? 'Запрос...' :
                          user.subscriptionStatus === 'active' ? 'Активна' :
                            isSubscribedBySomeoneElse ? 'Занят' :
                              'Подписка'}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Cancel Subscription Modal */}
          {isCancelSubscriptionModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200 modal-open">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl scale-100">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500 mx-auto mb-4">
                    <i className="fas fa-heart-broken text-2xl"></i>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Отмена подписки</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {user.role === UserRole.CUSTOMER
                      ? 'Вы уверены, что хотите отказаться от услуг помощника?'
                      : 'Вы уверены, что хотите отменить подписку на заказчика?'}
                  </p>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">Укажите причину отмены <span className="text-red-500">*</span></label>
                  <textarea
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-red-500 min-h-[100px] resize-none text-sm text-gray-900 placeholder-gray-400"
                    placeholder={user.role === UserRole.CUSTOMER ? "Например: помощник не выходит на связь..." : "Например: изменились обстоятельства..."}
                    value={cancelSubscriptionReason}
                    onChange={(e) => setCancelSubscriptionReason(e.target.value)}
                  ></textarea>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setIsCancelSubscriptionModalOpen(false);
                      setCancelSubscriptionReason('');
                    }}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  >
                    Вернуться
                  </button>
                  <button
                    onClick={handleCancelSubscription}
                    disabled={!cancelSubscriptionReason.trim()}
                    className="px-6 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition shadow-lg shadow-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Отменить подписку
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'subscription' && user.role === UserRole.EXECUTOR && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-8 bg-careem-primary text-white">
                <h2 className="text-3xl font-bold mb-2">PRO Тариф</h2>
                <p className="text-green-50">Выделите свой профиль и получайте на 70% больше заказов.</p>
              </div>
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-bold text-lg mb-4">Что вы получите:</h3>
                  <ul className="space-y-4">
                    <li className="flex items-center gap-3 text-sm text-gray-600">
                      <i className="fas fa-check-circle text-careem-primary"></i>
                      <span>Приоритетное отображение в поиске</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-gray-600">
                      <i className="fas fa-check-circle text-careem-primary"></i>
                      <span>Золотая рамка и бейдж PRO</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-gray-600">
                      <i className="fas fa-check-circle text-careem-primary"></i>
                      <span>Доступ к премиум-заказам</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-gray-600">
                      <i className="fas fa-check-circle text-careem-primary"></i>
                      <span>Сниженная комиссия платформы</span>
                    </li>
                  </ul>
                </div>
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col justify-center">
                  <p className="text-center text-gray-500 text-sm mb-2">Стоимость подписки</p>
                  <p className="text-center text-4xl font-black text-gray-900 mb-6">490 ₽ <span className="text-sm font-normal text-gray-400">/ месяц</span></p>
                  <button className="w-full bg-careem-primary text-white font-bold py-3 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-200">
                    Подключить сейчас
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'profile' && renderProfileEditor()}

          {isProfileModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 modal-open">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative animate-in zoom-in-95 duration-200">
                <button
                  onClick={() => setIsProfileModalOpen(false)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10 p-2 bg-white/80 rounded-full"
                >
                  <i className="fas fa-times text-xl"></i>
                </button>
                {renderProfileEditor()}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Delete Profile Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 modal-open">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                <i className="fas fa-exclamation-triangle text-xl"></i>
              </div>
              <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Удаление профиля</h3>
              <p className="text-gray-500 text-center text-sm mb-6">
                Вы собираетесь навсегда удалить свой профиль и все данные. Это действие необратимо.
                <br />
                Для подтверждения введите ваш пароль.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Пароль</label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => {
                      setDeletePassword(e.target.value);
                      setDeleteError('');
                    }}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
                    style={{ color: '#000000' }}
                    placeholder="Введите пароль"
                  />
                  {deleteError && <p className="text-red-500 text-xs mt-1">{deleteError}</p>}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsDeleteModalOpen(false);
                      setDeletePassword('');
                      setDeleteError('');
                    }}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleDeleteProfile}
                    className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition shadow-lg shadow-red-200"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
