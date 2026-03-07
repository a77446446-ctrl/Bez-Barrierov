
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, UserRole, Order, OrderStatus, Review, Location, Notification, OrderMessage } from '../types';
import { SERVICE_TYPES } from '../constants';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import OrderMap from '../components/OrderMap';
import { getSupabase } from '../services/supabaseClient';
import { profileRowToUser, userToProfileUpdate, orderRowToOrder, resolveProfileIdColumn } from '../services/mappers';
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
  const [activeTab, setActiveTab] = useState<'orders' | 'profile' | 'subscription' | 'history'>('orders');
  const [isSubscriptionConfirmationModalOpen, setIsSubscriptionConfirmationModalOpen] = useState(false);
  const [subscriptionRequestExecutor, setSubscriptionRequestExecutor] = useState<User | null>(null);
  // New state for blocking modal
  const [subscriptionCancelledNotification, setSubscriptionCancelledNotification] = useState<Notification | null>(null);

  useEffect(() => {
    if (user.role === UserRole.CUSTOMER && user.notifications) {
      const cancelledNotif = user.notifications.find(n =>
        n.title === 'Подписка отменена' && !n.read
      );

      if (cancelledNotif) {
        setSubscriptionCancelledNotification(cancelledNotif);
      } else {
        setSubscriptionCancelledNotification(null);
      }
    }
  }, [user.notifications, user.role]);

  const handleConfirmSubscriptionCancelled = async () => {
    if (!subscriptionCancelledNotification) return;

    // Dismiss the notification (mark as read/remove)
    await handleDismissNotification(subscriptionCancelledNotification.id);
    setSubscriptionCancelledNotification(null);
  };

  const ordersHeaderRef = useRef<HTMLHeadingElement | null>(null);
  const historyHeaderRef = useRef<HTMLHeadingElement | null>(null);
  const proTariffHeaderRef = useRef<HTMLHeadingElement | null>(null);
  const profileEditorRef = useRef<HTMLDivElement | null>(null);
  const verificationTimerRef = useRef<number | null>(null);
  const profileIdColumnRef = useRef<'id' | 'user_id'>('id');
  const userRef = useRef(user);
  const lastLocalUpdateRef = useRef<number>(0);

  useEffect(() => {
    userRef.current = user;
  }, [user]);





  const [orders, setOrders] = useState<Order[]>([]);
  const [orderMessages, setOrderMessages] = useState<Record<string, OrderMessage[]>>({});
  const [expandedHistoryItems, setExpandedHistoryItems] = useState<Set<string>>(new Set());
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

  // Modal auto-open logic removed
  /*
  useEffect(() => {
    if (user.role === UserRole.CUSTOMER && !isSubscriptionConfirmationModalOpen) {
      const pendingOrder = orders.find(o => o.status === OrderStatus.PENDING);
      if (pendingOrder && pendingOrder.executorId) {
        const executor = allUsers.find(u => u.id === pendingOrder.executorId);
        if (executor && executor.subscriptionRequestToCustomerId === user.id) {
          setSubscriptionRequestExecutor(executor);
          setIsSubscriptionConfirmationModalOpen(true);
        }
      }
    }
  }, [orders, user.role, allUsers, user.id]);
  */

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


  // Self-Repair: Executor detects Customer confirmation
  useEffect(() => {
    if (user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'pending' && user.subscriptionRequestToCustomerId) {
      const customer = allUsers.find(u => u.id === user.subscriptionRequestToCustomerId);
      if (customer && customer.subscribedExecutorId === user.id) {
        // Customer has confirmed us!
        const startDate = new Date().toISOString();
        const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const notification: Notification = {
          id: Date.now().toString(),
          type: 'success',
          title: 'Подписка подтверждена',
          message: `Заказчик ${customer.name} подтвердил вашу подписку`,
          date: new Date().toISOString(),
          read: false
        };

        const updatedExecutor = {
          ...user,
          subscriptionStatus: 'active' as const,
          subscriptionStartDate: startDate,
          subscriptionEndDate: endDate,
          subscribedToCustomerId: customer.id,
          subscriptionRequestToCustomerId: undefined,
          notifications: [notification, ...(user.notifications || [])]
        };

        // Update local
        updateUser(updatedExecutor);
        setAllUsers(prev => prev.map(u => u.id === user.id ? updatedExecutor : u));

        // Update DB
        const supabase = getSupabase();
        if (supabase) {
          resolveProfileIdColumn(supabase).then(col => {
            supabase.from('profiles').update(userToProfileUpdate(updatedExecutor)).eq(col, user.id).then();
          });
        }

        // Show alert
        setTimeout(() => alert('Ваша подписка подтверждена заказчиком!'), 50);
      }
      // Check for rejection signal
      else if (customer && customer.subscriptionRequestToCustomerId === `REJECTED:${user.id}`) {
        const notification: Notification = {
          id: Date.now().toString(),
          type: 'warning',
          title: 'Запрос на подписку отклонен',
          message: `Заказчик ${customer.name} отклонил ваш запрос на подписку.`,
          date: new Date().toISOString(),
          read: false
        };

        const updatedExecutor = {
          ...user,
          subscriptionStatus: 'none' as const,
          subscriptionRequestToCustomerId: undefined,
          notifications: [notification, ...(user.notifications || [])]
        };

        updateUser(updatedExecutor);
        setAllUsers(prev => prev.map(u => u.id === user.id ? updatedExecutor : u));

        const supabase = getSupabase();
        if (supabase) {
          resolveProfileIdColumn(supabase).then(col => {
            supabase.from('profiles').update(userToProfileUpdate(updatedExecutor)).eq(col, user.id).then();
          });
        }
        setTimeout(() => alert('Заказчик отклонил вашу подписку.'), 50);
      }
      // Check for CANCELLATION signal (Customer is no longer subscribed to us)
      else if (user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'active' && user.subscribedToCustomerId) {
        const customer = allUsers.find(u => u.id === user.subscribedToCustomerId);

        // If customer is loaded AND (customer says they are not subscribed to us OR customer says they are subscribed to someone else)
        if (customer && customer.subscribedExecutorId !== user.id) {
          // CONFIRMED CANCELLATION
          const notification: Notification = {
            id: Date.now().toString(),
            type: 'warning',
            title: 'Подписка отменена',
            message: `Заказчик ${customer.name} отменил подписку.`,
            date: new Date().toISOString(),
            read: false
          };

          const updatedExecutor = {
            ...user,
            subscriptionStatus: 'none' as const,
            subscriptionStartDate: undefined,
            subscriptionEndDate: undefined,
            subscribedToCustomerId: undefined,
            notifications: [notification, ...(user.notifications || [])]
          };

          updateUser(updatedExecutor);
          setAllUsers(prev => prev.map(u => u.id === user.id ? updatedExecutor : u));

          const supabase = getSupabase();
          if (supabase) {
            resolveProfileIdColumn(supabase).then(col => {
              supabase.from('profiles').update(userToProfileUpdate(updatedExecutor)).eq(col, user.id).then();
            });
          }
          setTimeout(() => alert('Заказчик отменил вашу подписку.'), 50);
        }
      }
    }
  }, [user, allUsers]);



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
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email || '');
  const [phone, setPhone] = useState(user.phone || '');
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
  const renderProfileEditor = () => {
    const isReadOnly = user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'active';
    return (
      <div ref={profileEditorRef} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-gray-900">
        <h3 className="text-lg font-bold text-gray-900 mb-6">Редактирование профиля</h3>
        {isReadOnly && (
          <div className="bg-blue-50 text-blue-600 p-4 rounded-xl mb-6 flex items-start gap-3">
            <i className="fas fa-info-circle mt-1"></i>
            <div>
              <p className="font-bold text-sm">Профиль доступен только для просмотра</p>
              <p className="text-xs mt-1">Во время активной подписки редактирование профиля отключено.</p>
            </div>
          </div>
        )}
        <form className="space-y-6" onSubmit={async (e) => {
          e.preventDefault();
          // @ts-ignore
          const name = e.target.name.value;
          // @ts-ignore
          const email = e.target.email.value;
          // @ts-ignore
          const phone = e.target.phone.value;

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
            phone,
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

          if (user.role === UserRole.CUSTOMER) {
            toast.success('Профиль успешно обновлен');
            navigate('/dashboard?tab=orders');
          } else {
            toast.success('Профиль отправлен на модерацию');
            setProfileVerificationStatus('pending');
          }
        }}>
          <fieldset disabled={isReadOnly} className="contents">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  Полное имя {(user.role === UserRole.CUSTOMER || user.role === UserRole.EXECUTOR) && <span className="text-red-500">*</span>}
                </label>
                <input
                  name="name"
                  type="text"
                  value={name}
                  required={user.role === UserRole.CUSTOMER || user.role === UserRole.EXECUTOR}
                  onChange={(e) => { setName(e.target.value); setHasUnsavedChanges(true); }}
                  className="w-full bg-gray-50 border-gray-200 rounded-xl py-3 px-4 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-careem-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  {user.id?.startsWith('telegram-') ? 'Профиль' : 'Email'} {(user.role === UserRole.CUSTOMER || user.role === UserRole.EXECUTOR) && <span className="text-red-500">*</span>}
                </label>
                <input
                  name="email"
                  type="email"
                  value={email}
                  required={user.role === UserRole.CUSTOMER || user.role === UserRole.EXECUTOR}
                  onChange={(e) => { setEmail(e.target.value); setHasUnsavedChanges(true); }}
                  className="w-full bg-gray-50 border-gray-200 rounded-xl py-3 px-4 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-careem-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  Телефон <span className="text-red-500">* <span className="text-gray-700 font-normal normal-case">(укажите действующий номер телефона)</span></span>
                </label>
                <input
                  name="phone"
                  type="tel"
                  value={phone}
                  required={user.role === UserRole.CUSTOMER || user.role === UserRole.EXECUTOR}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 11);
                    setPhone(val);
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full bg-gray-50 border-gray-200 rounded-xl py-3 px-4 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-careem-primary outline-none"
                  placeholder="79990000000"
                />
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
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  Фотография профиля {(user.role === UserRole.CUSTOMER || user.role === UserRole.EXECUTOR) && <span className="text-red-500">*</span>}
                </label>
                <label className={`mt-1 flex justify-center items-center px-6 pt-5 pb-6 border-2 border-dashed rounded-xl hover:border-careem-primary transition cursor-pointer relative group block w-full h-48 overflow-hidden bg-gray-50 ${!avatarPreview ? 'border-red-300' : 'border-gray-300'}`}>
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
                  Услуги и тарифы <span className="text-red-500">* <span className="text-gray-700 font-normal normal-case">(выберите минимум один пункт)</span></span>
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
                О себе {(user.role === UserRole.EXECUTOR || user.role === UserRole.CUSTOMER) && <span className="text-red-500">*</span>}
              </label>
              <textarea
                name="description"
                rows={4}
                value={profileDescription}
                required={(user.role === UserRole.EXECUTOR || user.role === UserRole.CUSTOMER)}
                onChange={(e) => { setProfileDescription(e.target.value); setHasUnsavedChanges(true); }}
                className="w-full bg-gray-50 border-gray-200 rounded-xl py-3 px-4 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-careem-primary outline-none"
                placeholder="Расскажите о себе..."
              ></textarea>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 gap-4">
              {user.role === UserRole.EXECUTOR || user.role === UserRole.CUSTOMER ? (
                <div className="flex flex-col gap-1">
                  {user.role === UserRole.EXECUTOR && profileVerificationStatus !== 'none' && (
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
                  (user.role === UserRole.CUSTOMER && !isProfileComplete)
                }
                className="w-full sm:w-auto bg-careem-primary/80 text-white font-bold py-3 px-8 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-careem-primary"
              >
                {user.role === UserRole.EXECUTOR
                  ? (profileVerificationStatus === 'verified' && !hasUnsavedChanges ? 'Опубликовано' : (profileVerificationStatus === 'pending' ? 'На проверке...' : 'Опубликовать'))
                  : 'Сохранить изменения'}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    );
  };


  const handleTabChange = (tab: 'orders' | 'profile' | 'subscription' | 'history') => {
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
    if (window.innerWidth < 1024) {
      ordersHeaderRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleGoToProfile = () => {
    if (window.innerWidth < 1024) {
      setIsProfileModalOpen(true);
      return;
    }
    if (!handleTabChange('profile')) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoToHistory = () => {
    if (!handleTabChange('history')) return;
    if (window.innerWidth < 1024) {
      historyHeaderRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleGoToSubscription = () => {
    if (user.subscriptionStatus === 'active') return;
    if (!handleTabChange('subscription')) return;

    // Use setTimeout to allow render to complete before scrolling
    setTimeout(() => {
      if (window.innerWidth < 1024) {
        proTariffHeaderRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 100);
  };

  const isExecutor = user.role === UserRole.EXECUTOR;
  const hasWorkPlace = !!locationCoords && (coverageRadius || 0) > 0;
  const hasAtLeastOneService = servicesState.some((s) => s.enabled);
  const hasAbout = profileDescription.trim().length > 0;

  const isProfileComplete = React.useMemo(() => {
    if (!user) return false;

    // Common checks
    const hasName = name && name.trim().length > 0;
    const hasEmail = email && email.trim().length > 0;
    const hasAvatar = !!avatarPreview;
    const hasDescription = profileDescription.trim().length > 0;

    // Check phone for 11 digits
    const hasValidPhone = phone && /^\d{11}$/.test(phone.replace(/\D/g, ''));

    if (user.role === UserRole.CUSTOMER) {
      return hasName && hasEmail && hasValidPhone && hasAvatar && hasDescription;
    }

    // Executor specific checks
    const hasLocation = !!locationCoords && (coverageRadius || 0) > 0;
    const hasServices = servicesState.some((s) => s.enabled);

    return hasName && hasEmail && hasValidPhone && hasLocation && hasServices && hasDescription && hasAvatar;
  }, [user, name, email, phone, avatarPreview, profileDescription, locationCoords, coverageRadius, servicesState]);

  const canPublishProfile = !isExecutor || isProfileComplete;

  const isProfileReadyForWork = React.useMemo(() => {
    if (!user) return false;
    if (user.role === UserRole.CUSTOMER) return true;

    // Executor check
    return isProfileComplete && user.profileVerificationStatus === 'verified';
  }, [user, isProfileComplete]);

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
    // Global Auto-Refresh Logic (Every 30 seconds)
    // This ensures both Customer and Executor stay in sync even if Realtime events are missed
    const refreshData = async () => {
      if (document.hidden) return; // Don't refresh if tab is background

      // Prevent race condition: If we just updated locally (within 5s), skip refresh
      // This avoids overwriting optimistic UI updates with stale server data
      if (Date.now() - lastLocalUpdateRef.current < 5000) return;

      const supabase = getSupabase();
      if (!supabase) return;

      try {
        // 1. Refresh User Profile
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', authUser.id).single();
          if (profile) {
            const mappedUser = profileRowToUser(profile);

            // Only update if something changed (deep comparison or critical fields)
            // But we can't use JSON.stringify on the whole object if it has functions or circular refs (unlikely for mappedUser)
            // Better to just update. updateUser handles state merging usually?
            // Actually, updateUser in useAuth replaces the state.
            // Let's do a simple check on critical fields to avoid rerender loops if object ref changes
            if (
              mappedUser.subscriptionStatus !== user.subscriptionStatus ||
              mappedUser.subscriptionRequestToCustomerId !== user.subscriptionRequestToCustomerId ||
              mappedUser.subscribedToCustomerId !== user.subscribedToCustomerId ||
              mappedUser.role !== user.role
            ) {
              updateUser(mappedUser);
            }
          }
        }

        // 2. Refresh Orders (if needed)
        const { data: ordersData } = await supabase.from('orders').select('*');
        if (ordersData) {
          const mappedOrders = ordersData.map(orderRowToOrder);
          // Simple length check or timestamp check could be better, but full replace is safest for sync
          setOrders(mappedOrders);
        }

        // 3. Refresh All Users (for finding counterparts)
        const { data: profilesData } = await supabase.from('profiles').select('*');
        if (profilesData) {
          const mappedProfiles = profilesData.map(profileRowToUser);
          setAllUsers(mappedProfiles);
        }

      } catch (err) {
        console.warn('Auto-refresh failed:', err);
      }
    };

    const intervalId = window.setInterval(refreshData, 30_000); // 30 seconds
    return () => window.clearInterval(intervalId);
  }, [user, updateUser]);

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
        // If already rejected, wait for user confirmation
        if (user.subscriptionStatus === 'rejected') return;

        console.log('Self-repair: Customer rejected me!');
        const updatedMe = {
          ...user,
          subscriptionStatus: 'rejected' as const,
          // Keep request ID to maintain link if needed, or clear it. 
          // Clearing it might break the check if we relied on it.
          // But here we rely on the Customer's signal.
          subscriptionRequestToCustomerId: undefined
        };
        updateUser(updatedMe);
      }
    }

    // 2. Check for Active Subscription Cancellation
    if (user.subscriptionStatus === 'active' && user.subscribedToCustomerId) {
      // Safety check: If subscription was just started (< 60 seconds), skip verification
      if (user.subscriptionStartDate) {
        const startDate = new Date(user.subscriptionStartDate);
        const now = new Date();
        const diffMs = now.getTime() - startDate.getTime();
        if (diffMs < 60000) { // 60 seconds buffer
          return;
        }
      }

      const customer = allUsers.find(u => u.id === user.subscribedToCustomerId);

      // If customer is found and they are NOT subscribed to me (or subscribed to someone else), cancel my sub
      if (customer && customer.subscribedExecutorId !== user.id) {
        console.log('Self-repair: Customer cancelled subscription!');

        const fetchCancellationReason = async () => {
          const supabase = getSupabase();
          if (!supabase) return 'Не указана';

          // Try to find the cancellation reason from recent 'Подписка' orders
          // logic similar to customer's check but looking for orders from customer
          const { data: recentOrders } = await supabase
            .from('orders')
            .select('*')
            .eq('customer_id', user.subscribedToCustomerId) // Customer who cancelled
            .eq('executor_id', user.id) // Me
            .eq('service_type', 'Подписка')
            .order('created_at', { ascending: false })
            .limit(1);

          let reason = 'Не указана';
          if (recentOrders && recentOrders.length > 0) {
            const lastOrder = recentOrders[0];
            // If status is CANCELLED or REJECTED
            if (lastOrder.rejection_reason) {
              reason = lastOrder.rejection_reason;
            } else if (lastOrder.details && lastOrder.details.includes('Причина:')) {
              reason = lastOrder.details.split('Причина:')[1].trim();
            }
          }
          return reason;
        };

        fetchCancellationReason().then(reason => {
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
              message: `Заказчик ${customer.name} отменил подписку. Причина: ${reason}`,
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
        });
      }
    }
  }, [user, allUsers, updateUser]);

  // Self-repair logic for Customer: Detect cancellation by Executor
  useEffect(() => {
    if (user.role !== UserRole.CUSTOMER || user.subscriptionStatus !== 'active' || !user.subscribedExecutorId) return;

    // Safety check: If subscription was just started (< 60 seconds), skip verification
    // This prevents race conditions where local state is updated before DB writes complete
    if (user.subscriptionStartDate) {
      const startDate = new Date(user.subscriptionStartDate);
      const now = new Date();
      const diffMs = now.getTime() - startDate.getTime();
      if (diffMs < 60000) { // 60 seconds buffer
        return;
      }
    }

    const checkSubscriptionSync = async () => {
      const supabase = getSupabase();
      if (!supabase) return;

      // 1. Fetch Executor Profile
      const { data: executorData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.subscribedExecutorId)
        .single();

      if (error || !executorData) return;
      const executor = profileRowToUser(executorData);

      // 2. Check for discrepancy
      // If Executor is NOT subscribed to this customer (or has no subscription at all)
      if (executor.subscribedToCustomerId !== user.id) {
        console.warn('Subscription discrepancy detected. Auto-cancelling for customer.');

        // 3. Try to find the cancellation reason from recent 'Подписка' orders
        const { data: recentOrders } = await supabase
          .from('orders')
          .select('*')
          .eq('customer_id', user.id)
          .eq('executor_id', executor.id)
          .eq('service_type', 'Подписка')
          .order('created_at', { ascending: false })
          .limit(1);

        let reason = 'Не указана';
        if (recentOrders && recentOrders.length > 0) {
          const lastOrder = recentOrders[0];
          if (lastOrder.rejection_reason) {
            reason = lastOrder.rejection_reason;
          } else if (lastOrder.details && lastOrder.details.includes('Причина:')) {
            reason = lastOrder.details.split('Причина:')[1].trim();
          }
        }

        // 4. Create Notification
        const notifTitle = 'Подписка отменена';
        // Check if we already have this notification to avoid loops
        const hasNotif = user.notifications?.some(n => n.title === notifTitle && !n.read);

        if (!hasNotif) {
          const notification: Notification = {
            id: Date.now().toString(),
            type: 'error',
            title: notifTitle,
            message: `Ваш помощник ${executor.name || 'Помощник'} отменил подписку. Причина: ${reason}`,
            date: new Date().toISOString(),
            read: false
          };

          const updatedUser = {
            ...user,
            subscriptionStatus: 'none' as const,
            subscribedExecutorId: undefined,
            subscriptionStartDate: undefined,
            subscriptionEndDate: undefined,
            notifications: [notification, ...(user.notifications || [])]
          };

          // 5. Update Local & DB
          updateUser(updatedUser);
        }
      }
    };

    checkSubscriptionSync();
  }, [user.id, user.role, user.subscriptionStatus, user.subscribedExecutorId, updateUser]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let isActive = true;

    // Initial load only
    setIsOrdersLoading(true);

    const loadOrders = async (isBackground = false, signal?: AbortSignal) => {
      try {


        let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (user.role === UserRole.CUSTOMER) {
          query = query.eq('customer_id', user.id);
        } else if (user.role === UserRole.EXECUTOR) {
          query = query.or(`executor_id.eq.${user.id},status.eq.${OrderStatus.OPEN}`);
        }

        const { data, error } = await query.abortSignal(signal || new AbortController().signal);

        if (error) throw error;
        if (!isActive) return;
        if (!Array.isArray(data)) {
          setOrders([]);
          setOrderMessages({});
          if (!isBackground) setIsOrdersLoading(false);
          return;
        }
        setOrders(data.map(orderRowToOrder));

        // Fetch messages for these orders
        const orderIds = data.map(o => o.id);
        if (orderIds.length > 0) {
          const { data: msgsData } = await supabase
            .from('order_messages')
            .select('*')
            .in('order_id', orderIds)
            .eq('is_approved', true) // only fetch approved
            .order('created_at', { ascending: true })
            .abortSignal(signal || new AbortController().signal);

          if (msgsData && Array.isArray(msgsData)) {
            const groupedMsgs: Record<string, OrderMessage[]> = {};
            msgsData.forEach(msg => {
              const mappedMsg: OrderMessage = {
                id: msg.id,
                orderId: msg.order_id,
                senderId: msg.sender_id,
                receiverId: msg.receiver_id,
                text: msg.text,
                createdAt: msg.created_at,
                isApproved: msg.is_approved
              };
              if (!groupedMsgs[msg.order_id]) groupedMsgs[msg.order_id] = [];
              groupedMsgs[msg.order_id].push(mappedMsg);
            });
            setOrderMessages(groupedMsgs);
          }
        } else {
          setOrderMessages({});
        }

        if (!isBackground) setIsOrdersLoading(false);
      } catch (err: any) {
        const isAbort = err.name === 'AbortError' ||
          (err.message && err.message.includes('AbortError')) ||
          (err.details && err.details.includes('AbortError'));

        if (!isAbort) {
          console.error('Error loading orders:', err);
          if (!isBackground) setIsOrdersLoading(false);
        }
      }
    };

    const controller = new AbortController();

    // Debounce initial load to avoid double-fetch in React Strict Mode (dev)
    const timeoutId = setTimeout(() => {
      void loadOrders(false, controller.signal);
    }, 100); // Short delay is enough

    // Auto-refresh every 60 seconds
    const intervalId = setInterval(() => {
      void loadOrders(true, controller.signal);
    }, 60000);

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

    // Подписка на изменения в реальном времени для PROFILES (уведомления, подписки)
    const profilesChannel = supabase
      .channel('realtime-profiles')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          if (!isActive) return;
          const updatedProfile = profileRowToUser(payload.new);

          setAllUsers((prev) => prev.map((u) => (u.id === updatedProfile.id ? updatedProfile : u)));

          // Если обновление касается текущего пользователя, обновляем его контекст
          if (updatedProfile.id === user.id) {
            updateUser(updatedProfile);
          }
        }
      )
      .subscribe();

    // Подписка на изменения в реальном времени для СООБЩЕНИЙ
    const messagesChannel = supabase
      .channel('realtime-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_messages' },
        (payload) => {
          if (!isActive) return;
          const msg = payload.new;
          if (msg.is_approved) {
            const mappedMsg: OrderMessage = {
              id: msg.id,
              orderId: msg.order_id,
              senderId: msg.sender_id,
              receiverId: msg.receiver_id,
              text: msg.text,
              createdAt: msg.created_at,
              isApproved: msg.is_approved
            };
            setOrderMessages(prev => {
              const grouped = { ...prev };
              if (!grouped[msg.order_id]) grouped[msg.order_id] = [];
              // check if already exists
              if (!grouped[msg.order_id].some(m => m.id === mappedMsg.id)) {
                grouped[msg.order_id] = [...grouped[msg.order_id], mappedMsg];
              }
              return grouped;
            });
          }
        }
      )
      .subscribe();

    return () => {
      isActive = false;
      controller.abort();
      clearTimeout(timeoutId);
      clearInterval(intervalId);
      supabase.removeChannel(channel);
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(messagesChannel);
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
      // Hide OPEN orders if subscription is pending
      if (user.subscriptionStatus === 'pending') return false;
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

  const activeOrders = allDisplayedOrders.filter(o => o.status !== OrderStatus.COMPLETED && o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.REJECTED);
  const completedOrders = allDisplayedOrders.filter(o => o.status === OrderStatus.COMPLETED || o.status === OrderStatus.CANCELLED || o.status === OrderStatus.REJECTED);

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

  // Subscription Rejection Modal State
  const [rejectSubscriptionId, setRejectSubscriptionId] = useState<string | null>(null);

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
    } catch { }

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
    lastLocalUpdateRef.current = Date.now();

    // EXPLICIT DB UPDATE: Ensure the status is persisted immediately to avoid race conditions
    const supabase = getSupabase();
    if (supabase) {
      try {
        const col = await resolveProfileIdColumn(supabase);
        await supabase.from('profiles').update(userToProfileUpdate(updatedUser)).eq(col, user.id);
      } catch (e) {
        console.error('Error persisting subscription request:', e);
      }
    }
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

    // Update Executor: status=rejected, remove request, add notification
    const updatedExecutor = {
      ...executor,
      subscriptionStatus: 'rejected' as const,
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
    lastLocalUpdateRef.current = Date.now();

    // 2. Background DB Update
    const supabase = getSupabase();
    if (supabase) {
      resolveProfileIdColumn(supabase).then(col => {
        // We update Executor directly via RPC or standard update if RLS allows
        // Since Customer usually can't update Executor profile directly due to RLS,
        // we might need to rely on the Customer's own signal or a server function.
        // However, for this demo/MVP, we try direct update. 
        // IF RLS BLOCKS THIS, we need a different approach (e.g., 'subscription_requests' table).
        // Current workaround: The Customer 'signals' via their own profile (already done above),
        // and the Executor 'pulls' this state via Realtime subscription or polling.

        // BUT, to ensure persistence, we MUST try to write the Executor state.
        supabase.from('profiles').update(userToProfileUpdate(updatedExecutor)).eq(col, executorId)
          .then(({ error }) => {
            if (error) {
              console.warn('RLS blocked Executor update. Using signal channel.', error);
              // If RLS blocks, we rely on the signal we set on the Customer profile:
              // subscriptionRequestToCustomerId: `REJECTED:${executorId}`
            }
          });

        supabase.from('profiles').update(userToProfileUpdate(updatedCustomer)).eq(col, user.id)
          .then(({ error }) => {
            if (error) console.error('Failed to update customer profile:', error);
          });
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
    const notification: Notification = {
      id: Date.now().toString(),
      type: 'success',
      title: 'Подписка подтверждена',
      message: `Заказчик ${user.name} подтвердил вашу подписку`,
      date: new Date().toISOString(),
      read: false
    };

    const updatedExecutor = {
      ...executor,
      subscriptionStatus: 'active' as const,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      subscribedToCustomerId: user.id,
      subscriptionRequestToCustomerId: undefined,
      notifications: [notification, ...(executor.notifications || [])]
    };

    // Update Customer (me)
    const updatedCustomer = {
      ...user,
      subscriptionStatus: 'active' as const,
      subscribedExecutorId: executorId,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      subscriptionRequestToCustomerId: undefined // Clear any previous rejection signals
    };

    // Update All Users
    const updatedAllUsers = allUsers.map(u => {
      if (u.id === executorId) return updatedExecutor;
      if (u.id === user.id) return updatedCustomer;
      return u;
    });

    // 1. Optimistic UI Update
    setAllUsers(updatedAllUsers);
    updateUser(updatedCustomer); // This handles the DB update for the customer
    lastLocalUpdateRef.current = Date.now();

    // Alert immediately (optimistic)
    setTimeout(() => alert('Подписка подтверждена!'), 50);

    // 2. Background DB Update for Executor (Customer update is handled by updateUser)
    const supabase = getSupabase();
    if (supabase) {
      resolveProfileIdColumn(supabase).then(async (col) => {
        try {
          await supabase.from('profiles').update(userToProfileUpdate(updatedExecutor)).eq(col, executorId);
        } catch (err) {
          console.warn('Failed to update executor profile (RLS?):', err);
        }

        // Explicitly update customer too to be safe (redundant with updateUser but safer)
        try {
          await supabase.from('profiles').update(userToProfileUpdate(updatedCustomer)).eq(col, user.id);
        } catch (err) {
          console.error('Failed to update customer profile:', err);
        }
      });
    }
  };

  const handleRenewSubscription = () => {
    // Reset to initial state or open modal to request again
    if (user.subscribedToCustomerId) {
      handleSubscribeRequest(user.subscribedToCustomerId);
    }
  };

  const [subscribeConfirmForCustomerId, setSubscribeConfirmForCustomerId] = useState<string | null>(null);

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

  const handleDismissRejection = async () => {
    // Reset Executor status to 'none' so they can try again
    const updatedUser = {
      ...user,
      subscriptionStatus: 'none' as const,
      subscriptionRequestToCustomerId: undefined
    };

    // Optimistic UI Update
    updateUser(updatedUser);

    // Background DB Update
    const supabase = getSupabase();
    if (supabase) {
      resolveProfileIdColumn(supabase).then(col => {
        supabase.from('profiles').update(userToProfileUpdate(updatedUser)).eq(col, user.id).then();
      });
    }
  };

  const handleCancelRequest = async () => {
    // Executor cancels their own pending request
    const updatedUser = {
      ...user,
      subscriptionStatus: 'none' as const,
      subscriptionRequestToCustomerId: undefined
    };

    // Optimistic UI Update
    updateUser(updatedUser);
    lastLocalUpdateRef.current = Date.now();

    // Background DB Update
    const supabase = getSupabase();
    if (supabase) {
      resolveProfileIdColumn(supabase).then(col => {
        supabase.from('profiles').update(userToProfileUpdate(updatedUser)).eq(col, user.id).then();
      });
    }
  };

  const handleCancelSubscription = async () => {
    if (!user.id) return;
    const supabase = getSupabase();

    // Handle Customer cancelling Executor
    if (user.role === UserRole.CUSTOMER) {
      // Try to find the executor object, but proceed even if not found (using local ID)
      const activeSubscriber = getActiveSubscriber(user.id);
      const executorId = user.subscribedExecutorId || activeSubscriber?.id;

      if (!executorId && !activeSubscriber) {
        // Fallback: If we have no ID, just reset self
        const updatedCustomer = {
          ...user,
          subscriptionStatus: 'none' as const,
          subscribedExecutorId: undefined,
          subscriptionStartDate: undefined,
          subscriptionEndDate: undefined
        };
        updateUser(updatedCustomer);
        setIsCancelSubscriptionModalOpen(false);
        return;
      }

      // Create notification for Executor (if we can find them to update locally)
      // Note: If executor is not loaded, we can't push notification to them via optimistic update easily
      // unless we assume they will pull it later or we use a DB insert for notifications.
      // For now, we update if found.
      let updatedExecutor = null;
      if (activeSubscriber) {
        const notification: Notification = {
          id: Date.now().toString(),
          type: 'warning',
          title: 'Подписка отменена',
          message: `Заказчик ${user.name} отменил подписку. Причина: ${cancelSubscriptionReason || 'Не указана'}`,
          date: new Date().toISOString(),
          read: false
        };

        updatedExecutor = {
          ...activeSubscriber,
          subscriptionStatus: 'none' as const,
          subscribedToCustomerId: undefined,
          subscriptionStartDate: undefined,
          subscriptionEndDate: undefined,
          subscriptionRequestToCustomerId: undefined,
          notifications: [...(activeSubscriber.notifications || []), notification]
        };
      }

      // Reset Customer Subscription (me)
      const updatedCustomer = {
        ...user,
        subscriptionStatus: 'none' as const,
        subscribedExecutorId: undefined,
        subscriptionStartDate: undefined,
        subscriptionEndDate: undefined
      };

      // Create Subscription History Record (for Customer cancellation)
      // Use Customer's own data if Executor data missing
      const startDateStr = user.subscriptionStartDate || activeSubscriber?.subscriptionStartDate;

      if (startDateStr || user.subscriptionStatus === 'active') {
        const startDate = startDateStr ? new Date(startDateStr) : new Date();
        const endDate = new Date();
        const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const historyOrder = {
          customer_id: user.id,
          executor_id: executorId, // Use the ID we found
          service_type: 'Подписка',
          status: OrderStatus.CANCELLED,
          date: new Date().toLocaleDateString('ru-RU'),
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          total_price: 0,
          details: `Подписка с ${startDate.toLocaleDateString('ru-RU')} по ${endDate.toLocaleDateString('ru-RU')} (${days} дн.). Отменил: Заказчик. Причина: ${cancelSubscriptionReason || 'Не указана'}`,
          rejection_reason: cancelSubscriptionReason
        };

        if (supabase) {
          // 1. Delete any active subscription order to prevent duplicates/stale data
          // We look for 'CONFIRMED' or 'PENDING' orders with 'Подписка' service type or generic
          const { data: activeOrders } = await supabase.from('orders').select('id')
            .eq('customer_id', user.id)
            .eq('executor_id', executorId)
            .in('status', ['CONFIRMED', 'PENDING'])
            .eq('service_type', 'Подписка'); // Assume specific type

          if (activeOrders && activeOrders.length > 0) {
            await supabase.from('orders').delete().in('id', activeOrders.map(o => o.id));
          }

          // 2. Insert History Record
          supabase.from('orders').insert(historyOrder).then(({ error }) => {
            if (error) console.error('Error logging subscription history:', error);
          });
        }
      }

      // 1. Optimistic UI Update - IMMEDIATELY apply changes locally
      const updatedAllUsers = allUsers.map(u => {
        if (updatedExecutor && u.id === updatedExecutor.id) return updatedExecutor;
        if (u.id === user.id) return updatedCustomer;
        return u;
      });
      setAllUsers(updatedAllUsers);
      updateUser(updatedCustomer); // Persist to local context/storage immediately (handles Customer DB update)

      // Close modal and UI feedback immediately
      setIsCancelSubscriptionModalOpen(false);
      setCancelSubscriptionReason('');

      // 2. Background DB Update for Executor (if found)
      if (updatedExecutor && supabase) {
        resolveProfileIdColumn(supabase).then(async (col) => {
          try {
            await supabase.from('profiles').update(userToProfileUpdate(updatedExecutor)).eq(col, updatedExecutor.id);
            console.log('Subscription cancelled in DB');
          } catch (err) {
            console.error('Error cancelling subscription in DB:', err);
          }
        });
      }
    }
    // Handle Executor cancelling their own subscription
    else if (user.role === UserRole.EXECUTOR) {
      const isPending = user.subscriptionStatus === 'pending';
      const customerId = user.subscribedToCustomerId || user.subscriptionRequestToCustomerId;

      const customer = customerId ? allUsers.find(u => u.id === customerId) : null;

      // Reset Customer Subscription (if exists and active)
      let updatedCustomer = null;
      if (customer) {
        // Create notification for Customer
        const notification: Notification = {
          id: Date.now().toString(),
          type: 'warning',
          title: isPending ? 'Запрос отменен' : 'Подписка отменена',
          message: isPending
            ? `Помощник ${user.name} отменил запрос на подписку.`
            : `Ваш помощник ${user.name} отменил подписку. Причина: ${cancelSubscriptionReason || 'Не указана'}`,
          date: new Date().toISOString(),
          read: false
        };

        updatedCustomer = {
          ...customer,
          // Only reset customer status if they were subscribed to THIS executor
          ...(customer.subscribedExecutorId === user.id ? {
            subscriptionStatus: 'none' as const,
            subscribedExecutorId: undefined,
            subscriptionStartDate: undefined,
            subscriptionEndDate: undefined
          } : {}),
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

      // NEW: Find and delete the active order associated with this subscription
      // We look for a CONFIRMED order between these two users
      if (supabase) {
        const { data: activeOrders } = await supabase.from('orders').select('id')
          .eq('customer_id', customerId)
          .eq('executor_id', user.id)
          .in('status', ['CONFIRMED', 'PENDING'])
          .eq('service_type', 'Подписка'); // Check service type too

        if (activeOrders && activeOrders.length > 0) {
          // Delete from DB
          await supabase.from('orders').delete().in('id', activeOrders.map(o => o.id));
          // Remove from local state immediately
          setOrders(prev => prev.filter(o => !activeOrders.some(ao => ao.id === o.id)));
        }
      }

      // 3. Create Subscription History Record
      if (isPending) {
        // For pending requests, we don't need a history record, or maybe a "cancelled request" record?
        // User asked for "subscription history". A pending request is not a subscription yet.
        // So we skip history for pending.
      } else {
        // Active subscription cancelled
        const startDate = user.subscriptionStartDate ? new Date(user.subscriptionStartDate) : new Date();
        const endDate = new Date();
        const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const historyOrder = {
          customer_id: customerId,
          executor_id: user.id,
          service_type: 'Подписка',
          status: OrderStatus.CANCELLED, // Use string literal to avoid enum import issues if any, or OrderStatus.COMPLETED
          date: new Date().toLocaleDateString('ru-RU'),
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          total_price: 0, // Or calculate if we have price
          details: `Подписка с ${startDate.toLocaleDateString('ru-RU')} по ${endDate.toLocaleDateString('ru-RU')} (${days} дн.). Отменил: Помощник. Причина: ${cancelSubscriptionReason || 'Не указана'}`,
          rejection_reason: cancelSubscriptionReason
        };

        const supabase = getSupabase();
        if (supabase) {
          await supabase.from('orders').insert(historyOrder);
        }
      }

      updateUser(updatedExecutor);

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
      case OrderStatus.CANCELLED: return 'Отменен';
      case OrderStatus.REJECTED: return 'Отклонен';
      default: return status;
    }
  };

  const getServiceHeaderInfo = (serviceType: string) => {
    const service = SERVICE_TYPES.find(st => st.name === serviceType);
    if (!service || !service.headerImage) return null;
    return { image: service.headerImage, color: service.headerColor || 'transparent' };
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




  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-in slide-in-from-right-4 duration-500">
      {/* Executor Subscription Status Overlay (Rejected ONLY) */}
      {user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'rejected' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-xl text-center space-y-4 animate-in zoom-in-95 duration-200">

            {/* REJECTED STATE */}
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-times-circle text-3xl text-red-600 dark:text-red-400"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              Отказ в подписке
            </h3>
            <p className="text-gray-600 dark:text-gray-300">
              Вам отказ в подписке с заказчиком попробуйте оформить подписку с другим заказчиком
            </p>
            <button
              onClick={handleDismissRejection}
              className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition shadow-lg shadow-red-200"
            >
              Понял
            </button>

          </div>
        </div>
      )}

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

      {/* Active Subscription Banner for Customer OR Cancellation Notice */}
      {user.role === UserRole.CUSTOMER && (() => {
        // 1. Check for Cancellation Notification
        if (subscriptionCancelledNotification) {
          return (
            <div className="bg-red-50 rounded-3xl p-6 mb-8 shadow-xl border border-red-200 animate-in slide-in-from-top-4">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center border border-red-200 shadow-inner shrink-0 text-red-500">
                    <i className="fas fa-user-slash text-3xl"></i>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold mb-1 text-red-900">{subscriptionCancelledNotification.title}</h3>
                    <p className="text-red-800 text-sm opacity-90">{subscriptionCancelledNotification.message}</p>
                    <p className="text-xs text-red-600 mt-2">{new Date(subscriptionCancelledNotification.date).toLocaleString()}</p>
                  </div>
                </div>

                <button
                  onClick={handleConfirmSubscriptionCancelled}
                  className="bg-red-600 text-white font-bold py-3 px-8 rounded-xl hover:bg-red-700 transition shadow-lg shadow-red-200 shrink-0"
                >
                  Понятно
                </button>
              </div>
            </div>
          );
        }

        // 2. Active Subscription
        // Use local user state for subscription info, fallback to finding executor
        const subscribedExecutorId = user.subscribedExecutorId;
        const isSubscribed = user.subscriptionStatus === 'active';

        // Find executor in loaded users, or try to get from user.subscribedExecutorId
        const activeSubscriber = subscribedExecutorId
          ? allUsers.find(u => u.id === subscribedExecutorId)
          : getActiveSubscriber(user.id);

        // Use end date from user profile (if available) or from executor
        const endDateStr = user.subscriptionEndDate || activeSubscriber?.subscriptionEndDate;

        if (isSubscribed && endDateStr) {
          const endDate = new Date(endDateStr);
          const now = new Date();
          const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
          const assistantName = activeSubscriber ? activeSubscriber.name : 'Помощник';

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
                    <h3 className="text-2xl font-bold mb-1">Ваш личный помощник: {assistantName}</h3>
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
            u.subscriptionRequestToCustomerId === user.id &&
            u.id !== user.subscribedExecutorId &&
            user.subscriptionRequestToCustomerId !== `REJECTED:${u.id}`
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
                      onClick={() => setRejectSubscriptionId(requester.id)}
                      className="flex-1 sm:flex-none bg-red-50 text-red-600 font-bold py-3 sm:py-2 px-4 rounded-xl hover:bg-red-100 transition shadow-sm border border-red-100 text-center justify-center"
                    >
                      Отказать
                    </button>
                    <button
                      onClick={async () => {
                        await handleConfirmSubscription(requester.id);
                        const pendingOrder = orders.find(o =>
                          o.status === OrderStatus.PENDING &&
                          o.executorId === requester.id
                        );
                        if (pendingOrder) {
                          await handleDeleteOrder(pendingOrder.id);
                        }
                      }}
                      className="flex-1 sm:flex-none bg-careem-primary/80 text-white font-bold py-3 sm:py-2 px-4 rounded-xl hover:bg-green-700 transition shadow-md text-center justify-center"
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
                onClick={handleGoToProfile}
                disabled={user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'pending'}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition border ${activeTab === 'profile'
                  ? 'bg-gradient-to-br from-careem-dark to-[#003822] text-white border-careem-dark/50 shadow-lg'
                  : user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'pending'
                    ? 'text-gray-400 cursor-not-allowed opacity-50 bg-gray-50 border-gray-100'
                    : 'bg-gradient-to-br from-careem-dark/40 to-[#003822]/40 text-gray-700 border-gray-100 hover:from-careem-dark/55 hover:to-[#003822]/55 hover:shadow-md'
                  }`}
              >
                <i className="fas fa-user-circle mr-3"></i> Профиль
              </button>
              <button
                onClick={handleGoToOrders}
                disabled={user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'pending'}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition relative border ${activeTab === 'orders' && !showOpenOrders
                  ? 'bg-gradient-to-br from-careem-dark to-[#003822] text-white border-careem-dark/50 shadow-lg'
                  : user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'pending'
                    ? 'text-gray-400 cursor-not-allowed opacity-50 bg-gray-50 border-gray-100'
                    : 'bg-gradient-to-br from-careem-dark/40 to-[#003822]/40 text-gray-700 border-gray-100 hover:from-careem-dark/55 hover:to-[#003822]/55 hover:shadow-md'
                  }`}
              >
                <i className="fas fa-home mr-3"></i> {user.subscriptionStatus === 'active' ? 'Статус подписки' : 'Мои заказы'}

                {/* Customer Subscription Request Notification */}
                {user.role === UserRole.CUSTOMER && allUsers.some(u => u.role === UserRole.EXECUTOR && u.subscriptionRequestToCustomerId === user.id) && (
                  <div className="absolute top-2 right-3">
                    <i className="fas fa-crown text-yellow-400 text-lg animate-pulse drop-shadow-md"></i>
                  </div>
                )}

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
                onClick={handleGoToHistory}
                disabled={(user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'active') || (user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'pending')}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition border ${activeTab === 'history'
                  ? 'bg-gradient-to-br from-careem-dark to-[#003822] text-white border-careem-dark/50 shadow-lg'
                  : (user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'active') || (user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'pending')
                    ? 'text-gray-400 cursor-not-allowed opacity-50 bg-gray-50 border border-gray-100'
                    : 'bg-gradient-to-br from-careem-dark/40 to-[#003822]/40 text-gray-700 border-gray-100 hover:from-careem-dark/55 hover:to-[#003822]/55 hover:shadow-md'
                  }`}
              >
                <i className="fas fa-history mr-3"></i> История
              </button>
              {user.role === UserRole.EXECUTOR && (
                <button
                  onClick={handleGoToSubscription}
                  disabled={user.subscriptionStatus === 'active' || user.subscriptionStatus === 'pending'}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition ${activeTab === 'subscription'
                    ? 'bg-gradient-to-br from-careem-dark to-[#003822] text-white border border-careem-dark/50 shadow-lg'
                    : user.subscriptionStatus === 'active' || user.subscriptionStatus === 'pending'
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
                    После входа вам станет доступен Мой кабинет, история заявок и создание новых заказов.
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
            user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'pending' ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow-lg border border-gray-100 dark:border-gray-700 animate-in fade-in duration-300">
                <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-6">
                  <i className="fas fa-clock text-3xl animate-pulse"></i>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Ожидание подтверждения</h3>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider rounded-full mb-6">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                  Запрос отправлен
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-8 max-w-md mx-auto leading-relaxed">
                  Ваш запрос на подписку успешно отправлен.<br />
                  Пожалуйста, ожидайте решения заказчика. Как только он подтвердит запрос, вам откроется доступ к работе.
                </p>

                <button
                  onClick={handleCancelRequest}
                  className="bg-red-50 text-red-600 hover:bg-red-100 font-bold py-3 px-8 rounded-xl transition border border-red-100"
                >
                  Отменить запрос
                </button>
              </div>
            ) :
              !isProfileReadyForWork && user.role === UserRole.EXECUTOR ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-8 text-center animate-in fade-in duration-300">
                  <div className="w-20 h-20 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i className="fas fa-user-shield text-3xl"></i>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Требуется верификация</h3>
                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    {!isProfileComplete
                      ? "Чтобы видеть доступные заказы и начать работу, пожалуйста, полностью заполните свой профиль (имя, телефон, описание, местоположение и услуги)."
                      : "Ваш профиль находится на проверке. Дождитесь подтверждения администратором, чтобы получить доступ к заказам."}
                  </p>
                  {!isProfileComplete && (
                    <button
                      onClick={handleGoToProfile}
                      className="bg-careem-primary/80 text-white font-bold py-3 px-8 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-200"
                    >
                      Перейти к профилю
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 ref={ordersHeaderRef} className="text-2xl font-bold text-slate-100">
                      {showOpenOrders ? 'Доступные заказы' : user.subscriptionStatus === 'active' ? 'Статус подписки' : 'Мои заказы'}
                    </h2>
                    {!(user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'active') || showOpenOrders ? (
                      <div className="flex gap-2">
                        <button className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs font-semibold text-slate-200 hover:bg-white/10 transition">Фильтры</button>
                      </div>
                    ) : null}
                  </div>

                  {user.role === UserRole.EXECUTOR && openOrders.length > 0 && !showOpenOrders && orders.every(o => o.status !== OrderStatus.CONFIRMED) && user.subscriptionStatus !== 'active' && user.subscriptionStatus !== 'pending' && (
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

                  {user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'rejected' ? (
                    <div className="bg-white p-12 rounded-3xl border border-red-100 text-center shadow-lg animate-in fade-in slide-in-from-bottom-4 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-400 to-red-600"></div>

                      <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm relative z-10">
                        <i className="fas fa-times-circle text-4xl text-red-500"></i>
                      </div>
                      <h3 className="text-2xl font-black text-gray-900 mb-3 relative z-10">Отказано в подписке</h3>
                      <p className="text-gray-500 max-w-md mx-auto mb-8 relative z-10 leading-relaxed">
                        Ожидание подтверждения, что заказчик отказал в подписке.
                      </p>

                      <div className="relative z-10">
                        <button
                          onClick={async () => {
                            const updatedMe = { ...user, subscriptionStatus: 'none' as const };
                            updateUser(updatedMe);
                            const supabase = getSupabase();
                            if (supabase) {
                              const col = await resolveProfileIdColumn(supabase);
                              await supabase.from('profiles').update({ subscription_status: 'none' }).eq(col, user.id);
                            }
                          }}
                          className="bg-gray-900 text-white font-bold py-3 px-8 rounded-xl hover:bg-gray-800 transition shadow-lg inline-flex items-center gap-2"
                        >
                          <i className="fas fa-check"></i> Подтвердить
                        </button>
                      </div>
                    </div>
                  ) : user.role === UserRole.EXECUTOR && user.subscriptionStatus === 'pending' ? (
                    <div className="bg-white p-12 rounded-3xl border border-yellow-100 text-center shadow-lg animate-in fade-in slide-in-from-bottom-4 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-400 to-yellow-600"></div>
                      <div className="absolute -top-10 -right-10 w-32 h-32 bg-yellow-50 rounded-full blur-2xl opacity-50 pointer-events-none"></div>
                      <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-yellow-50 rounded-full blur-2xl opacity-50 pointer-events-none"></div>

                      <div className="w-24 h-24 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm relative z-10 animate-pulse">
                        <i className="fas fa-clock text-4xl text-yellow-500"></i>
                      </div>
                      <h3 className="text-2xl font-black text-gray-900 mb-3 relative z-10">Ожидание подтверждения</h3>
                      <p className="text-gray-500 max-w-md mx-auto mb-8 relative z-10 leading-relaxed">
                        Ваш запрос на подписку успешно отправлен. <br />
                        Пожалуйста, ожидайте решения заказчика. Как только он подтвердит запрос, вам откроется доступ к работе.
                      </p>

                      {user.subscriptionRequestToCustomerId && (
                        <div className="bg-gray-50 rounded-2xl p-5 inline-block mb-8 border border-gray-100 relative z-10 shadow-sm">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Запрос отправлен</p>
                          <div className="flex items-center gap-3 justify-center">
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-gray-400 border border-gray-200">
                              <i className="fas fa-user"></i>
                            </div>
                            <p className="font-bold text-gray-900 text-lg">
                              {allUsers.find(u => u.id === user.subscriptionRequestToCustomerId)?.name || 'Пользователь'}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="relative z-10">
                        <button
                          onClick={() => handleCancelSubscription()}
                          className="text-red-500 font-bold hover:text-red-600 transition text-sm bg-red-50 hover:bg-red-100 px-6 py-2.5 rounded-xl border border-red-100 inline-flex items-center gap-2 whitespace-nowrap"
                        >
                          <i className="fas fa-times"></i> Отменить запрос
                        </button>
                      </div>
                    </div>
                  ) : user.role === UserRole.EXECUTOR && !showOpenOrders && user.subscriptionStatus === 'active' && user.subscriptionEndDate ? (
                    (() => {
                      const endDate = new Date(user.subscriptionEndDate);
                      const now = new Date();
                      const diffTime = Math.abs(endDate.getTime() - now.getTime());
                      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      const customer = allUsers.find(u => u.id === user.subscribedToCustomerId);

                      return (
                        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 w-full text-center relative overflow-hidden animate-in slide-in-from-bottom-4">
                          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-400 to-yellow-600"></div>

                          <div className="w-24 h-24 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                            <i className="fas fa-crown text-4xl text-yellow-500"></i>
                          </div>

                          <h2 className="text-2xl font-black text-gray-900 mb-2">Подписка активна</h2>
                          <p className="text-gray-500 mb-8">Вы успешно подписаны на заказчика. Доступ к общей ленте заказов ограничен.</p>

                          {customer && (
                            <div
                              className="bg-white rounded-2xl p-5 border border-yellow-400 mb-8 max-w-md mx-auto shadow-sm relative overflow-hidden transition"
                            >
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Ваш заказчик</p>
                              <div className="flex items-center gap-4 justify-center mb-6">
                                <div className="relative">
                                  <img
                                    src={customer.avatar || `https://ui-avatars.com/api/?name=${customer.name}`}
                                    alt={customer.name}
                                    className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-md"
                                  />
                                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                                    <i className="fas fa-check text-[8px] text-white"></i>
                                  </div>
                                </div>
                                <div className="text-left">
                                  <h4 className="font-bold text-gray-900 text-lg leading-tight">{customer.name}</h4>
                                  <p className="text-xs text-gray-500 font-medium">Персональная подписка</p>
                                </div>
                              </div>

                              <div className="pt-4 border-t border-gray-100">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Истекает через</p>
                                <div className="text-3xl font-black text-careem-primary mb-1">
                                  {daysLeft} <span className="text-sm text-gray-400 font-medium">дней</span>
                                </div>
                                <p className="text-[10px] text-gray-400">Дата окончания: {endDate.toLocaleDateString()}</p>
                              </div>
                            </div>
                          )}

                          <div className="max-w-md mx-auto mb-6">
                            <button
                              onClick={() => setIsCancelSubscriptionModalOpen(true)}
                              className="w-full bg-white border-2 border-red-100 text-red-500 font-bold py-3 rounded-xl hover:bg-red-50 transition flex items-center justify-center gap-2"
                            >
                              <i className="fas fa-times-circle"></i>
                              Отменить подписку
                            </button>
                          </div>

                          {/* Блок информации об отмене подписки */}
                          {user.subscriptionStatus === 'none' && (
                            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 max-w-md mx-auto mb-6 text-left animate-in fade-in slide-in-from-bottom-2">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-500 flex-shrink-0">
                                  <i className="fas fa-ban"></i>
                                </div>
                                <div>
                                  <h4 className="font-bold text-red-800 text-sm mb-1">Подписка отменена</h4>
                                  <p className="text-xs text-red-600 mb-1">
                                    <span className="font-semibold">Кем:</span> Вами
                                  </p>
                                  <p className="text-xs text-red-500">
                                    {new Date().toLocaleString('ru-RU')}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {daysLeft <= 1 && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 max-w-md mx-auto">
                              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-bold mb-4 border border-red-100">
                                <i className="fas fa-exclamation-circle mr-2"></i>
                                Подписка скоро истекает!
                              </div>
                              <button
                                onClick={handleRenewSubscription}
                                className="w-full bg-careem-primary/80 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-200"
                              >
                                Сделать новый запрос заказчику
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : user.role === UserRole.CUSTOMER && user.subscriptionStatus === 'active' ? (
                    (() => {
                      const activeSubscriber = getActiveSubscriber(user.id);
                      const executor = allUsers.find(u => u.id === user.subscribedExecutorId);
                      const endDate = activeSubscriber?.subscriptionEndDate
                        ? new Date(activeSubscriber.subscriptionEndDate)
                        : (executor?.subscriptionEndDate
                          ? new Date(executor.subscriptionEndDate)
                          : (user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : new Date()));
                      const now = new Date();
                      const diffTime = Math.max(0, endDate.getTime() - now.getTime());
                      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                      return (
                        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 w-full text-center relative overflow-hidden animate-in slide-in-from-bottom-4">
                          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-400 to-green-600"></div>

                          <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                            <i className="fas fa-crown text-4xl text-green-500"></i>
                          </div>

                          <h2 className="text-2xl font-black text-gray-900 mb-2">PRO Подписка</h2>
                          <p className="text-gray-500 mb-6">Активна до {endDate.toLocaleDateString()}</p>

                          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 mb-8 max-w-md mx-auto shadow-sm">
                            <div className="flex flex-col items-center justify-center gap-3 mb-4">
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ваш личный помощник</p>
                              <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
                                {executor?.avatar && <img src={executor.avatar} alt={executor.name} className="w-10 h-10 rounded-full object-cover border border-gray-100" />}
                                <div className="text-xl font-bold text-gray-900">{executor?.name || 'Имя скрыто'}</div>
                              </div>
                            </div>
                            <p className="text-sm text-gray-500 leading-relaxed">Вам помогает профессиональный ассистент. <br /> Осталось <span className="font-bold text-careem-primary text-lg">{daysLeft}</span> дней.</p>
                          </div>

                          <div className="max-w-md mx-auto">
                            <button
                              onClick={() => setIsCancelSubscriptionModalOpen(true)}
                              className="w-full bg-white border-2 border-red-100 text-red-500 font-bold py-3 rounded-xl hover:bg-red-50 transition flex items-center justify-center gap-2"
                            >
                              <i className="fas fa-times-circle"></i>
                              Отменить подписку
                            </button>
                          </div>
                        </div>
                      );
                    })()
                  ) : activeOrders.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                      {/* Active Orders */}
                      {activeOrders.map(order => (
                        <div key={order.id} className="p-0 rounded-3xl shadow-[0_0_40px_rgba(45,107,255,0.4)] border-0 overflow-hidden transition duration-300 backdrop-blur-xl hover:shadow-[0_0_60px_rgba(45,107,255,0.6)]">
                          {/* Inner Card Container with Inner Shadow */}
                          <div className="m-0 p-6 rounded-3xl relative overflow-hidden group transition-all duration-300 bg-gradient-to-br from-careem-dark to-[#003822] border border-careem-dark/50 shadow-xl text-white">
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
                            <div className="relative z-10">

                              {/* Header: Status + Icon + Type + Date */}
                              <div className="flex justify-end mb-2">
                                <span
                                  className={[
                                    'text-[9px] leading-none font-black uppercase tracking-wide whitespace-nowrap drop-shadow-[0_6px_18px_rgba(0,0,0,0.55)]',
                                    getStatusColor(order.status),
                                    order.status === OrderStatus.PENDING ? 'animate-pulse' : ''
                                  ].join(' ')}
                                >
                                  {getStatusLabel(order.status)}
                                </span>
                              </div>

                              {/* Header: Иконка + Название + Дата/Время */}
                              <div className="flex items-center gap-3 mb-5 flex-wrap">
                                {/* Яркая иконка рука с сердцем — на одной плоскости с заголовком */}
                                <i className="fas fa-hand-holding-heart text-2xl text-[#FF6B6B] drop-shadow-[0_0_8px_rgba(255,107,107,0.7)] shrink-0"></i>
                                <div className="flex-grow min-w-0">
                                  <h4 className="font-extrabold text-white text-base sm:text-lg leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] truncate">
                                    {order.serviceType}
                                  </h4>
                                  <p className="text-xs font-medium text-white/90 mt-1 flex items-center gap-2 flex-wrap drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                                    <span className="bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded border border-white/20 font-bold">{order.date}</span>
                                    <span className="bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded border border-white/20 font-bold">{order.time}</span>
                                  </p>
                                </div>
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



                              {/* Expanded Content Area (Audio, etc.) */}
                              <div className="space-y-4 mt-2">
                                {(order.status === OrderStatus.REJECTED || (order.status === OrderStatus.OPEN && order.rejectionReason)) && (
                                  <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-red-100 rounded-full blur-2xl -mr-8 -mt-8"></div>
                                    <div className="relative z-10">
                                      <h5 className="text-red-600 font-bold text-sm mb-2 flex items-center gap-2">
                                        <i className="fas fa-exclamation-circle"></i> Помощник отказался от выполнения
                                      </h5>
                                      <div className="bg-white/60 rounded-xl p-3 border border-red-100 mb-3">
                                        <p className="text-[10px] text-red-400 font-bold uppercase tracking-wide mb-1">Причина отказа:</p>
                                        <p className="text-sm text-red-800 font-medium italic">"{order.rejectionReason}"</p>
                                      </div>
                                      <div className="flex items-start gap-2 text-red-700/80 text-xs">
                                        <i className="fas fa-info-circle mt-0.5 shrink-0"></i>
                                        <p>Ваш заказ переведен в статус <span className="font-bold">"Свободен"</span>. Ожидайте, когда его примет другой свободный помощник.</p>
                                      </div>
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

                                    // Подписка доступна только для прямых (персональных) заказов.
                                    const isDirectOrder = !!(order as any).isDirectOrder;
                                    const canRequestSubscription = isDirectOrder &&
                                      (!customer.subscriptionStatus || customer.subscriptionStatus === 'none');

                                    const BOT_USERNAME = 'NoBarriers_BOT';
                                    const chatLink = `https://t.me/${BOT_USERNAME}?start=chat_${order.id.replace(/-/g, '')}_e`;

                                    return (
                                      <div className="w-full mt-4 p-3 sm:p-4 bg-white/5 rounded-2xl border border-white/10">
                                        {/* Аватар + Имя + бадж */}
                                        <div className="flex items-center gap-3 flex-wrap">
                                          {/* Аватар — клик открывает профиль */}
                                          <button
                                            onClick={() => setViewingCustomer(customer)}
                                            className="shrink-0 relative group/avatar focus:outline-none"
                                            title="Открыть профиль"
                                          >
                                            <img
                                              src={customer.avatar || `https://ui-avatars.com/api/?name=${customer.name}`}
                                              alt={customer.name}
                                              className="w-12 h-12 rounded-2xl object-cover border-2 border-white/10 group-hover/avatar:border-careem-primary/60 transition shadow-sm"
                                            />
                                            {/* Вспышка при наведении */}
                                            <div className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition flex items-center justify-center">
                                              <i className="fas fa-eye text-white text-xs"></i>
                                            </div>
                                          </button>

                                          {/* Имя + бейдж */}
                                          <div className="flex-grow min-w-0">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mb-0.5">Заказчик</p>
                                            <h4 className="font-bold text-slate-100 text-sm truncate">{customer.name}</h4>
                                            {canRequestSubscription && (
                                              <div className="mt-1 inline-flex items-center gap-1.5 bg-white/5 border border-purple-500/30 px-2 py-0.5 rounded-lg">
                                                <i className="fas fa-crown text-orange-400 text-[9px] animate-pulse"></i>
                                                <span className="text-[9px] font-bold text-purple-200">Доступна подписка</span>
                                              </div>
                                            )}
                                          </div>

                                          {/* Написать через бота */}
                                          <a
                                            href={chatLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-[#2D6BFF]/15 border border-[#2D6BFF]/30 rounded-xl text-xs font-bold text-[#6899ff] hover:bg-[#2D6BFF]/25 active:scale-95 transition"
                                          >
                                            <i className="fab fa-telegram-plane text-sm"></i>
                                            <span className="hidden sm:inline">Написать</span>
                                          </a>
                                        </div>
                                      </div>
                                    );
                                  })()
                                )}


                                {/* Order Taken Status Block for Customer */}
                                {user.role === UserRole.CUSTOMER && order.status === OrderStatus.CONFIRMED && (
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
                                            <span>Свяжитесь с помощником для уточнения деталей</span>
                                          </li>
                                          <li className="flex items-start gap-2">
                                            <span className="bg-white/10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">2</span>
                                            <span>Ожидайте прибытия помощника и выполнения услуги</span>
                                          </li>
                                          <li className="flex items-start gap-2">
                                            <span className="bg-white/10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">3</span>
                                            <span>После выполнения нажмите "Подтвердить выполнение"</span>
                                          </li>
                                        </ul>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Executor Info for Customer - Full Details */}
                                {user.role === UserRole.CUSTOMER && order.executorId && (
                                  (() => {
                                    const executor = allUsers.find(u => u.id === order.executorId);
                                    if (!executor) return null;

                                    const BOT_USERNAME = 'NoBarriers_BOT';
                                    const chatLink = `https://t.me/${BOT_USERNAME}?start=chat_${order.id.replace(/-/g, '')}_c`;

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
                                              <p className="text-xs text-slate-300 mb-3 line-clamp-2">{executor.description}</p>
                                            )}

                                            <div className="flex flex-wrap gap-2 mt-2">
                                              {/* Профиль */}
                                              <button
                                                onClick={() => setViewingCustomer(executor as any)}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition"
                                              >
                                                <i className="fas fa-user"></i>
                                                Портфолио
                                              </button>
                                              {/* Написать через бота */}
                                              <a
                                                href={chatLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 px-3 py-1.5 bg-[#2D6BFF]/15 border border-[#2D6BFF]/30 rounded-xl text-xs font-bold text-[#6899ff] hover:bg-[#2D6BFF]/25 transition"
                                              >
                                                <i className="fab fa-telegram-plane"></i>
                                                Написать
                                              </a>
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
                                              className="bg-careem-primary/80 text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-green-700 transition"
                                            >
                                              Выбрать
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Order Messages Feed */}
                                {orderMessages[order.id] && orderMessages[order.id].length > 0 && (
                                  <div className="w-full mt-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                                    <h5 className="font-bold text-sm text-slate-300 mb-3 flex items-center gap-2">
                                      <i className="fas fa-comments text-careem-primary"></i> Сообщения по заказу
                                    </h5>
                                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                      {orderMessages[order.id].map(msg => {
                                        const isMine = msg.senderId === user.id;
                                        const sender = allUsers.find(u => u.id === msg.senderId);
                                        return (
                                          <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                                            <div className="flex items-center gap-2 mb-1">
                                              {!isMine && (
                                                <img src={sender?.avatar || `https://ui-avatars.com/api/?name=${sender?.name || 'User'}`} alt="avatar" className="w-5 h-5 rounded-full" />
                                              )}
                                              <span className="text-[10px] text-zinc-400 font-bold">{isMine ? 'Вы' : sender?.name || 'Пользователь'}</span>
                                              <span className="text-[9px] text-zinc-500">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <div className={`px-3 py-2 rounded-2xl text-sm max-w-[85%] ${isMine ? 'bg-[#2D6BFF] text-white rounded-tr-sm' : 'bg-white/10 text-slate-200 rounded-tl-sm'}`}>
                                              {msg.text}
                                            </div>
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

                              {/* Actions Footer */}
                              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/10 mt-4">
                                {user.role === UserRole.EXECUTOR && order.status === OrderStatus.PENDING && (
                                  <>
                                    <button onClick={() => handleUpdateOrderStatus(order.id, OrderStatus.CONFIRMED)} className="flex-1 bg-careem-primary/80 text-white py-2.5 rounded-2xl hover:bg-[#255EE6] transition font-bold text-sm shadow-lg shadow-[#2D6BFF]/20" title="Подтвердить">
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
                                    className="flex-1 py-3 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-xl border border-white/20 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),inset_0_-4px_8px_rgba(0,0,0,0.2),0_10px_30px_rgba(0,0,0,0.3)] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.5),inset_0_-4px_8px_rgba(0,0,0,0.2),0_15px_35px_rgba(45,107,255,0.3)] transform hover:-translate-y-0.5"
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
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSubscriptionRequestExecutor(executor);
                                            setIsSubscriptionConfirmationModalOpen(true);
                                          }}
                                          className="w-full bg-careem-primary/10 text-careem-primary border border-careem-primary/30 py-3 rounded-xl hover:bg-careem-primary/20 transition font-bold text-sm flex items-center justify-center gap-2 shadow-sm animate-pulse"
                                          title="Посмотреть запрос"
                                        >
                                          <i className="fas fa-bell"></i> Входящий запрос на подписку
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

                              {/* Address Information - Moved to Details Modal */}

                              {/* Order Map Visualization Removed */}
                            </div>
                          </div>
                        </div>
                      ))}


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
              )
          )}



          {/* Order Details Modal */}
          {selectedOrderDetails && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200 modal-open">
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
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 h-full flex flex-col justify-center">
                      <p className="text-xs text-gray-400 font-bold uppercase mb-1">Дата</p>
                      <p className="font-bold text-gray-900 flex items-center gap-2 text-sm whitespace-nowrap overflow-hidden">
                        <i className="fas fa-calendar-alt text-careem-primary shrink-0"></i>
                        <span className="truncate">{selectedOrderDetails.date}</span>
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 h-full flex flex-col justify-center">
                      <p className="text-xs text-gray-400 font-bold uppercase mb-1">Время</p>
                      <p className="font-bold text-gray-900 flex items-center gap-2 text-sm whitespace-nowrap overflow-hidden">
                        <i className="fas fa-clock text-careem-primary shrink-0"></i>
                        <span className="truncate">{selectedOrderDetails.time}</span>
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
                        <OrderMap order={selectedOrderDetails} hideInfo />
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
                        <OrderMap order={selectedOrderDetails} hideInfo />
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
                      className="w-full bg-careem-primary/80 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-100"
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
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4 modal-open">
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
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200 modal-open">
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
                    className="px-6 py-2 bg-careem-primary/80 text-white font-bold rounded-lg hover:bg-green-700 transition shadow-lg shadow-green-200"
                  >
                    Отправить отзыв
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Customer / User Profile Info Modal */}
          {viewingCustomer && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200 modal-open">
              <div className="bg-[#0D1626] rounded-3xl max-w-sm w-full shadow-2xl border border-white/10 overflow-hidden relative animate-in zoom-in-95 duration-200">

                {/* Кнопка закрытия */}
                <button
                  onClick={() => setViewingCustomer(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 transition flex items-center justify-center text-slate-300 z-10"
                >
                  <i className="fas fa-times text-sm"></i>
                </button>

                {/* Шапка с градиентом */}
                <div className="relative">
                  <div className="h-24 bg-gradient-to-br from-[#1B2D4F] to-[#0D1626] overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-careem-primary/10 rounded-full blur-3xl pointer-events-none"></div>
                  </div>
                  {/* Аватар поверх шапки */}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-1/2">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#0D1626] shadow-xl">
                      <img
                        src={viewingCustomer.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(viewingCustomer.name)}&background=1B2D4F&color=fff`}
                        alt={viewingCustomer.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>

                {/* Основное содержимое */}
                <div className="pt-16 px-5 pb-6">
                  {/* Имя и роль */}
                  <div className="text-center mb-5">
                    <h3 className="text-xl font-extrabold text-slate-100">{viewingCustomer.name}</h3>
                    <span className="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-slate-300">
                      <i className="fas fa-wheelchair text-careem-primary text-[10px]"></i>
                      Заказчик
                    </span>
                  </div>

                  {/* Описание */}
                  {viewingCustomer.description && (
                    <div className="mb-3 p-3 bg-white/5 rounded-2xl border border-white/10">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">О себе</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{viewingCustomer.description}</p>
                    </div>
                  )}

                  {/* Информационные поля */}
                  <div className="space-y-2">
                    {viewingCustomer.location && (
                      <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                        <i className="fas fa-map-marker-alt text-careem-primary w-4 text-center shrink-0"></i>
                        <div className="min-w-0">
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Район</p>
                          <p className="text-sm text-slate-300 truncate">{viewingCustomer.location}</p>
                        </div>
                      </div>
                    )}

                    {viewingCustomer.rating != null && (
                      <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                        <i className="fas fa-star text-yellow-400 w-4 text-center shrink-0"></i>
                        <div>
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Рейтинг</p>
                          <p className="text-sm text-slate-200 font-bold">{viewingCustomer.rating} / 5.0</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Кнопка закрытия */}
                  <button
                    onClick={() => setViewingCustomer(null)}
                    className="w-full mt-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition font-semibold text-sm"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </div>
          )}

          {subscribeConfirmForCustomerId && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200 modal-open">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl scale-100">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center text-yellow-500 mx-auto mb-4">
                    <i className="fas fa-crown text-2xl"></i>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Подтвердите подписку</h3>
                  <p className="text-sm text-gray-500 mt-1">Перед оформлением ознакомьтесь с преимуществами.</p>
                </div>
                <div className="space-y-3 mb-6">
                  <p className="text-gray-700 text-sm">Если заказчик (инвалид) регистрирует транспорт в официальном реестре, а вы сопровождаете его — вы получаете законные преимущества передвижения:</p>
                  <ul className="text-sm text-gray-900 space-y-2">
                    <li>✨ Парковка на местах для инвалидов</li>
                    <li>✨ Бесплатные городские парковки (при наличии регистрации)</li>
                    <li>✨ Быстрый доступ к больницам, МФЦ и госучреждениям</li>
                    <li>✨ Минимум времени на поиск парковки</li>
                    <li>✨ Защита от штрафов при соблюдении правил</li>
                  </ul>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setSubscribeConfirmForCustomerId(null)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => {
                      if (subscribeConfirmForCustomerId) {
                        handleSubscribeRequest(subscribeConfirmForCustomerId);
                        setSubscribeConfirmForCustomerId(null);
                      }
                    }}
                    className="px-6 py-2 bg-yellow-400 text-gray-900 font-bold rounded-lg hover:bg-yellow-500 transition shadow-lg"
                  >
                    Подтвердить
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cancel Subscription Modal */}
          {isCancelSubscriptionModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200 modal-open">
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
                    className="w-[90%] px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  >
                    Вернуться
                  </button>
                  <button
                    onClick={handleCancelSubscription}
                    disabled={!cancelSubscriptionReason.trim()}
                    className="w-[90%] px-6 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition shadow-lg shadow-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Отменить
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <h2 ref={historyHeaderRef} className="text-2xl font-bold text-slate-100 mb-6">История заказов</h2>

              {(() => {
                const historyOrders = orders.filter(o =>
                  o.status === OrderStatus.COMPLETED ||
                  o.status === OrderStatus.CANCELLED
                ).sort((a, b) => {
                  const timeA = getOrderDateTimeMs(a) || 0;
                  const timeB = getOrderDateTimeMs(b) || 0;
                  return timeB - timeA;
                });

                if (historyOrders.length === 0) {
                  return (
                    <div className="bg-white/5 p-12 rounded-2xl border border-dashed border-white/10 text-center backdrop-blur-sm">
                      <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i className="fas fa-history text-4xl text-slate-500"></i>
                      </div>
                      <h3 className="text-xl font-bold text-slate-200 mb-2">История пуста</h3>
                      <p className="text-slate-400">Вы еще не завершили ни одного заказа.</p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 gap-4">
                    {historyOrders.map(order => (
                      <div key={order.id} className="bg-[#13213A] rounded-2xl shadow-lg border border-[#1B2D4F] relative overflow-hidden group hover:border-careem-primary/30 transition">
                        <div
                          onClick={() => {
                            // Accordion behavior: toggle current, close others
                            const newExpanded = new Set<string>();
                            if (!expandedHistoryItems.has(order.id)) {
                              newExpanded.add(order.id);
                            }
                            setExpandedHistoryItems(newExpanded);
                          }}
                          className="p-6 cursor-pointer"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg ${order.status === OrderStatus.COMPLETED ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                                {getStatusLabel(order.status)}
                              </span>
                              <h4 className="font-bold text-slate-100 text-lg mt-2">{order.serviceType}</h4>
                              <p className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                                <i className="far fa-calendar-alt"></i> {order.date}
                                <i className="far fa-clock ml-2"></i> {order.time}
                              </p>
                            </div>
                            <div className="text-right flex flex-col items-end gap-2">
                              {order.serviceType !== 'Подписка' && (
                                <p className="text-xl font-black text-slate-100">{order.totalPrice} ₽</p>
                              )}
                              <i className={`fas fa-chevron-down text-slate-400 transition-transform ${expandedHistoryItems.has(order.id) ? 'rotate-180' : ''}`}></i>
                            </div>
                          </div>
                        </div>

                        {expandedHistoryItems.has(order.id) && (
                          <div className="px-6 pb-6 pt-0 animate-in slide-in-from-top-2 border-t border-white/5">
                            <div className="pt-4">
                              {/* Details/Reason */}
                              {order.details && (
                                <div className="bg-white/5 rounded-xl p-3 mb-4 text-sm text-slate-300 border border-white/5">
                                  {order.details}
                                </div>
                              )}

                              {/* Who cancelled info if available */}
                              {order.status === OrderStatus.CANCELLED && order.rejectionReason && order.serviceType !== 'Подписка' && (
                                <div className="bg-red-500/10 rounded-xl p-3 mb-4 text-sm text-red-300 border border-red-500/20">
                                  <span className="font-bold">Причина отмены:</span> {order.rejectionReason}
                                </div>
                              )}

                              {/* Rating & Review */}
                              {order.status === OrderStatus.COMPLETED && order.rating && (
                                <div className="bg-yellow-500/10 rounded-xl p-3 mb-4 border border-yellow-500/20">
                                  <div className="flex items-center gap-1 mb-2">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                      <i
                                        key={star}
                                        className={`fas fa-star text-sm ${star <= (order.rating || 0) ? 'text-yellow-400' : 'text-slate-600'}`}
                                      ></i>
                                    ))}
                                    <span className="text-xs text-slate-400 ml-2 font-medium">
                                      {order.rating}/5
                                    </span>
                                  </div>
                                  {order.review && (
                                    <p className="text-sm text-slate-300 italic">
                                      "{order.review}"
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Counterpart Info & Delete Action */}
                              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                                <div className="flex items-center gap-3">
                                  {(() => {
                                    const counterpartId = user.role === UserRole.CUSTOMER ? order.executorId : order.customerId;
                                    const counterpart = allUsers.find(u => u.id === counterpartId);

                                    if (!counterpartId) return <span className="text-xs text-slate-500">Системное событие</span>;
                                    if (!counterpart) return <span className="text-xs text-slate-500">Пользователь удален</span>;

                                    return (
                                      <>
                                        <img src={counterpart.avatar || `https://ui-avatars.com/api/?name=${counterpart.name}`} className="w-8 h-8 rounded-full object-cover border border-white/10" alt="" />
                                        <div>
                                          <p className="text-xs font-bold text-slate-200">{counterpart.name}</p>
                                          <p className="text-[10px] text-slate-500">{user.role === UserRole.CUSTOMER ? 'Помощник' : 'Заказчик'}</p>
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm('Вы уверены, что хотите удалить этот заказ из истории?')) {
                                      handleDeleteOrder(order.id);
                                    }
                                  }}
                                  className="text-slate-500 hover:text-red-400 transition text-xs font-bold flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-red-500/10"
                                  title="Удалить из истории"
                                >
                                  <i className="fas fa-trash-alt"></i> Удалить
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {activeTab === 'subscription' && user.role === UserRole.EXECUTOR && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-8 bg-careem-primary text-white">
                <h2 ref={proTariffHeaderRef} className="text-3xl font-bold mb-2">PRO Тариф</h2>
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
                  <button className="w-full bg-careem-primary/80 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-200">
                    Подключить сейчас
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'profile' && renderProfileEditor()}

          {isProfileModalOpen && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 modal-open">
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
      {/* Subscription Rejection Confirmation Modal */}
      {rejectSubscriptionId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4 modal-open">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Отклонить запрос?</h3>
            <p className="text-gray-600 mb-6">Вы уверены, что хотите отказать в подписке?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setRejectSubscriptionId(null)}
                className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
              >
                Отмена
              </button>
              <button
                onClick={async () => {
                  if (rejectSubscriptionId) {
                    await handleRejectSubscription(rejectSubscriptionId);
                    const pendingOrder = orders.find(o =>
                      o.status === OrderStatus.PENDING &&
                      o.executorId === rejectSubscriptionId
                    );
                    if (pendingOrder) {
                      await handleDeleteOrder(pendingOrder.id);
                    }
                    setRejectSubscriptionId(null);
                  }
                }}
                className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition shadow-lg shadow-red-500/30"
              >
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Profile Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4 modal-open">
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
