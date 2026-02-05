import React, { useState, useEffect } from 'react';
import { User, UserRole, ServiceType, Order, OrderStatus } from '../types';
import { SERVICE_TYPES, MOCK_USERS, MOCK_ORDERS } from '../constants';
import { getSmartRecommendations } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import OrderMap from '../components/OrderMap';

interface LandingProps {
  onViewProfile: (executor: User) => void;
  onBook: (executor: User) => void;
}

const Landing: React.FC<LandingProps> = ({ onViewProfile, onBook }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [aiRecs, setAiRecs] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [executors, setExecutors] = useState<User[]>([]);
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);
  const [sortType, setSortType] = useState<'rating' | 'price'>('rating');
  
  const formatAddress = (address?: string) => {
    if (!address) return 'Адрес не указан';
    // Remove country and postal code for cleaner display
    return address
      .replace(/, \d{6}/, '') // Remove zip code
      .replace(/, Россия$/, '') // Remove country at end
      .replace(/^Россия, /, '') // Remove country at start
      .replace(/Россия, /, ''); // Remove country in middle
  };

  useEffect(() => {
    const loadData = () => {
      // Load Users
      const storedUsers = localStorage.getItem('bez_barrierov_users');
      let users: User[] = storedUsers ? JSON.parse(storedUsers) : MOCK_USERS;
      
      // Filter out legacy mock users (Alexey Petrov and Maria Sidorova)
      users = users.filter(u => u.id !== 'u2' && u.id !== 'u3');
      
      const executorUsers = users.filter(u => u.role === UserRole.EXECUTOR).reverse();
      setExecutors(executorUsers);

      // Load Orders for Executors
      if (user?.role === UserRole.EXECUTOR) {
        const storedOrders = localStorage.getItem('bez_barrierov_orders');
        const orders: Order[] = storedOrders ? JSON.parse(storedOrders) : MOCK_ORDERS;
        // Show OPEN orders
        setAvailableOrders(orders.filter(o => o.status === OrderStatus.OPEN));
      }
    };
    
    loadData();
    window.addEventListener('storage', loadData);
    return () => window.removeEventListener('storage', loadData);
  }, [user]);
  
  const handleSmartSearch = async () => {
    if (!searchTerm) return;
    setIsAiLoading(true);
    const recs = await getSmartRecommendations(searchTerm, executors);
    setAiRecs(recs || null);
    setIsAiLoading(false);
  };

  const handleTakeOrder = (orderId: string) => {
    const storedOrders = localStorage.getItem('bez_barrierov_orders');
    const orders: Order[] = storedOrders ? JSON.parse(storedOrders) : MOCK_ORDERS;
    
    const updatedOrders = orders.map(o => {
      if (o.id === orderId) {
        return { 
          ...o, 
          status: OrderStatus.CONFIRMED, 
          executorId: user!.id 
        };
      }
      return o;
    });
    
    localStorage.setItem('bez_barrierov_orders', JSON.stringify(updatedOrders));
    setAvailableOrders(updatedOrders.filter(o => o.status === OrderStatus.OPEN));
    navigate('/dashboard');
  };

  const filteredExecutors = executors.filter(e => {
    const matchesSearch = e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          e.description?.toLowerCase().includes(searchTerm.toLowerCase());
    // Hide executors who are already subscribed/active helpers for someone
    return matchesSearch && e.subscriptionStatus !== 'active';
  }).sort((a, b) => {
    // Priority to subscribed executors (if any logic needed here, currently we hide active ones)
    // but user asked for sorting by rating and price
    
    if (sortType === 'rating') {
      // Sort by Rating (desc), then by Reviews Count (desc)
      const ratingDiff = (b.rating || 0) - (a.rating || 0);
      if (ratingDiff !== 0) return ratingDiff;
      return (b.reviewsCount || 0) - (a.reviewsCount || 0);
    } else if (sortType === 'price') {
      // Sort by Average Price (asc)
      const getAvgPrice = (u: User) => {
        if (!u.customServices || u.customServices.length === 0) return 0;
        const enabledServices = u.customServices.filter(s => s.enabled);
        if (enabledServices.length === 0) return 0;
        const sum = enabledServices.reduce((acc, curr) => acc + curr.price, 0);
        return sum / enabledServices.length;
      };
      
      const priceA = getAvgPrice(a);
      const priceB = getAvgPrice(b);
      
      // If price is 0 (not set), put at the end? Or beginning? 
      // Usually "lowest price" implies valid prices. Let's treat 0 as Infinity for sorting if we want cheapest valid options first.
      // However, usually 0 means "negotiable" or "free" or "not set". 
      // Let's stick to simple numeric sort.
      // If we want to penalize no-price users, we can do that.
      // Let's assume 0 is effectively "unknown" and put them last.
      
      if (priceA === 0 && priceB !== 0) return 1;
      if (priceA !== 0 && priceB === 0) return -1;
      
      return priceA - priceB;
    }
    return 0;
  });

  return (
    <div className="animate-in fade-in duration-500">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-careem-dark via-green-800 to-careem-dark text-white py-24 px-4 overflow-hidden relative">
        {/* Background decorative element */}
        <div className="absolute top-0 right-0 -mr-32 -mt-32 w-96 h-96 bg-careem-accent rounded-full blur-3xl opacity-20"></div>
        <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-80 h-80 bg-careem-primary rounded-full blur-3xl opacity-10"></div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight tracking-tight">
            Жизнь без барьеров. <br/><span className="text-careem-accent">Движение — это радость.</span>
          </h1>
          <p className="text-xl text-green-50 mb-12 max-w-2xl mx-auto font-light leading-relaxed">
            Найдите проверенного спутника для комфортного передвижения по городу, помощи в быту или сопровождения на важные встречи.
          </p>
          
          <div className="bg-white/10 backdrop-blur-xl p-5 rounded-3xl shadow-2xl border border-white/20 ring-1 ring-white/10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <i className="fas fa-search absolute left-4 top-4 text-careem-primary"></i>
                <input 
                  type="text" 
                  placeholder="Какая помощь вам нужна сегодня?" 
                  className="w-full bg-white text-gray-900 rounded-2xl py-4 pl-12 pr-12 focus:outline-none focus:ring-2 focus:ring-careem-primary text-sm text-center truncate"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div>
                <select 
                  className="w-full bg-white text-gray-900 rounded-2xl py-4 px-4 focus:outline-none focus:ring-2 focus:ring-careem-primary text-sm h-full text-center truncate"
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                >
                  <option value="">Все виды услуг</option>
                  {SERVICE_TYPES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <button 
                onClick={handleSmartSearch}
                className="bg-careem-primary hover:bg-green-700 text-white font-bold py-4 px-6 rounded-2xl transition shadow-lg flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
                disabled={isAiLoading}
              >
                {isAiLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-magic"></i>}
                Умный поиск
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Order Details Modal */}
      {selectedOrderDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
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
              <div className="flex items-center justify-between mb-6 bg-careem-light p-4 rounded-xl border border-green-100">
                <div>
                  <p className="text-xs text-careem-primary font-bold uppercase mb-1">Стоимость</p>
                  <p className="text-2xl font-bold text-careem-dark">{selectedOrderDetails.totalPrice} ₽</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-careem-primary font-bold uppercase mb-1">Статус</p>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${selectedOrderDetails.status === OrderStatus.OPEN ? 'bg-green-100 text-careem-dark' : 'bg-gray-100 text-gray-700'}`}>
                    {selectedOrderDetails.status === OrderStatus.OPEN ? 'Свободен' : 'Занят'}
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
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
                      <span className="font-bold bg-green-100 text-green-700 px-2 py-1 rounded text-xs shrink-0 mt-0.5">А</span>
                      <div>
                        <p className="text-xs text-green-700 font-bold mb-0.5">Точка отправления</p>
                        <p className="text-sm text-gray-800 font-medium">{formatAddress(selectedOrderDetails.locationFrom.address)}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
                      <span className="font-bold bg-red-100 text-red-700 px-2 py-1 rounded text-xs shrink-0 mt-0.5">Б</span>
                      <div>
                        <p className="text-xs text-red-700 font-bold mb-0.5">Точка назначения</p>
                        <p className="text-sm text-gray-800 font-medium">{formatAddress(selectedOrderDetails.locationTo.address)}</p>
                      </div>
                    </div>
                    
                    <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 h-64 relative z-0 mt-3">
                      <OrderMap order={selectedOrderDetails} />
                    </div>
                  </div>
                ) : selectedOrderDetails.generalLocation ? (
                  <div>
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 mb-3">
                      <i className="fas fa-map-marker-alt text-red-500 mt-1 shrink-0 text-lg"></i>
                      <div>
                        <p className="text-xs text-gray-500 font-bold mb-0.5">Место встречи</p>
                        <p className="text-sm text-gray-800 font-medium">{formatAddress(selectedOrderDetails.generalLocation.address)}</p>
                      </div>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 h-64 relative z-0">
                      <OrderMap order={selectedOrderDetails} />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">Адрес уточняется у заказчика</p>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button 
                onClick={() => {
                  handleTakeOrder(selectedOrderDetails.id);
                  setSelectedOrderDetails(null);
                }}
                className="flex-1 bg-careem-primary text-white font-bold py-3 rounded-xl hover:bg-careem-dark transition shadow-lg shadow-green-100"
              >
                Взять заказ
              </button>
              <button 
                onClick={() => setSelectedOrderDetails(null)}
                className="flex-1 bg-white text-gray-500 font-bold py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Recommendations Area */}
      {aiRecs && (
        <section className="max-w-5xl mx-auto px-4 -mt-10 relative z-20">
          <div className="bg-careem-light border-2 border-green-200 rounded-3xl p-6 shadow-2xl flex items-start gap-4 ring-1 ring-white/50">
            <div className="bg-careem-primary text-white p-3 rounded-2xl shrink-0 shadow-lg">
              <i className="fas fa-brain"></i>
            </div>
            <div>
              <h3 className="font-bold text-careem-dark mb-1">Рекомендация ИИ «Без Барьеров»:</h3>
              <p className="text-careem-dark text-sm leading-relaxed">{aiRecs}</p>
            </div>
            <button onClick={() => setAiRecs(null)} className="text-careem-primary hover:text-careem-dark ml-auto">
              <i className="fas fa-times"></i>
            </button>
          </div>
        </section>
      )}

      {/* Results Section */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">
              {user?.subscriptionStatus === 'active' 
                ? 'Ваш статус'
                : user?.role === UserRole.EXECUTOR ? 'Доступные заказы' : 'Наши специалисты'
              }
            </h2>
            <p className="text-gray-500 mt-2">
              {user?.subscriptionStatus === 'active'
                ? 'Информация о текущей подписке'
                : user?.role === UserRole.EXECUTOR 
                  ? 'Заказы, которые ждут вашего отклика' 
                  : 'Верифицированные помощники, готовые прийти на помощь'
              }
            </p>
          </div>
          {user?.subscriptionStatus !== 'active' && (
            <div className="flex gap-2 p-1 bg-gray-100 rounded-xl text-xs font-bold">
              <button 
                onClick={() => setSortType('rating')}
                className={`px-4 py-2 rounded-lg transition ${
                  sortType === 'rating' 
                    ? 'bg-white shadow-sm text-careem-primary' 
                    : 'text-gray-500 hover:text-careem-primary'
                }`}
              >
                {user?.role === UserRole.EXECUTOR ? 'Срочные' : 'По рейтингу'}
              </button>
              <button 
                onClick={() => setSortType('price')}
                className={`px-4 py-2 rounded-lg transition ${
                  sortType === 'price' 
                    ? 'bg-white shadow-sm text-careem-primary' 
                    : 'text-gray-500 hover:text-careem-primary'
                }`}
              >
                {user?.role === UserRole.EXECUTOR ? 'По дате' : 'По цене'}
              </button>
            </div>
          )}
        </div>

        {/* Conditional Rendering based on Role */}
        {user?.role === UserRole.EXECUTOR ? (
          user?.subscriptionStatus === 'active' ? (
            <div className="col-span-full text-center py-20 bg-green-50 rounded-3xl border border-green-100">
               <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                   <i className="fas fa-check-circle text-5xl text-green-500"></i>
               </div>
               <h2 className="text-3xl font-black text-gray-900 mb-4">Вы уже подписаны</h2>
               <p className="text-xl text-gray-600 max-w-2xl mx-auto">У вас активная подписка на заказчика. Доступ к общей ленте заказов ограничен.</p>
               <button onClick={() => navigate('/dashboard')} className="mt-8 bg-careem-primary text-white font-bold py-3 px-8 rounded-xl hover:bg-careem-dark transition shadow-lg shadow-green-200">
                   Перейти в личный кабинет
               </button>
            </div>
          ) : (
          // EXECUTOR VIEW: OPEN ORDERS
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {availableOrders.length > 0 ? (
              availableOrders.map(order => (
                <div 
                  key={order.id} 
                  className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 group flex flex-col"
                >
                  <div className="p-6 flex-grow">
                    <div className="flex items-center justify-between mb-4">
                      <span className="bg-green-50 text-careem-dark px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                        {order.serviceType}
                      </span>
                      <span className="font-bold text-gray-900">{order.totalPrice} ₽</span>
                    </div>
                    
                    <div className="space-y-3 mb-6">
                      <div className="flex items-center text-gray-600 text-sm">
                        <i className="fas fa-calendar-alt w-5 text-careem-primary"></i>
                        <span className="font-medium">{order.date}</span>
                        <span className="mx-2 text-gray-300">|</span>
                        <i className="fas fa-clock w-5 text-careem-primary"></i>
                        <span className="font-medium">{order.time}</span>
                      </div>

                      <div className="mt-3 relative pl-2">
                        {order.locationFrom && order.locationTo ? (
                          <>
                             {/* Vertical connecting line */}
                             <div className="absolute left-[5px] top-2 bottom-4 w-0.5 bg-gray-200"></div>
                             
                             {/* Point A (Start) */}
                             <div className="flex items-center gap-3 relative z-10 mb-2">
                               <div className="w-2.5 h-2.5 rounded-full bg-green-500 ring-4 ring-white shrink-0 shadow-sm"></div>
                               <span className="text-sm font-medium text-gray-900 line-clamp-1" title={order.locationFrom.address}>
                                 {formatAddress(order.locationFrom.address).split(',')[0]}
                               </span>
                             </div>
                             
                             {/* Point B (End) */}
                             <div className="flex items-center gap-3 relative z-10">
                               <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-4 ring-white shrink-0 shadow-sm"></div>
                               <span className="text-sm font-medium text-gray-900 line-clamp-1" title={order.locationTo.address}>
                                 {formatAddress(order.locationTo.address).split(',')[0]}
                               </span>
                             </div>
                          </>
                        ) : (
                          <div className="flex items-start text-gray-600 text-sm">
                            <i className="fas fa-map-marker-alt w-5 text-careem-primary mt-1"></i>
                            <span className="font-medium line-clamp-1">
                              {order.locationFrom 
                                ? formatAddress(order.locationFrom.address).split(',')[0]
                                : order.generalLocation 
                                  ? formatAddress(order.generalLocation.address).split(',')[0]
                                  : 'Город не указан'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6 pt-0 mt-auto flex gap-3">
                    <button 
                      onClick={() => setSelectedOrderDetails(order)}
                      className="flex-1 bg-careem-light text-careem-primary font-bold py-3 rounded-xl hover:bg-green-100 transition flex items-center justify-center gap-2"
                      title="Подробнее о заказе"
                    >
                      <i className="fas fa-info-circle text-lg"></i>
                      <span>Подробнее</span>
                    </button>
                    <button 
                      onClick={() => handleTakeOrder(order.id)}
                      className="flex-1 bg-careem-primary text-white font-bold py-3 rounded-xl hover:bg-careem-dark transition shadow-lg shadow-green-100"
                    >
                      Взять заказ
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-12 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                <i className="fas fa-inbox text-4xl text-gray-300 mb-4"></i>
                <h3 className="text-lg font-bold text-gray-900">Нет доступных заказов</h3>
                <p className="text-gray-500 text-sm">Сейчас нет свободных заявок. Загляните позже!</p>
              </div>
            )}
          </div>
          )
        ) : (
          // CUSTOMER/GUEST VIEW: SPECIALISTS
          user?.role === UserRole.CUSTOMER && user?.subscriptionStatus === 'active' ? (
             <div className="col-span-full text-center py-20 bg-green-50 rounded-3xl border border-green-100">
                 <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                     <i className="fas fa-user-shield text-5xl text-green-500"></i>
                 </div>
                 <h2 className="text-3xl font-black text-gray-900 mb-4">У вас есть личный помощник</h2>
                 <p className="text-xl text-gray-600 max-w-2xl mx-auto">Вы уже нашли своего специалиста. Все новые задачи направляются ему напрямую.</p>
                 <button onClick={() => navigate('/dashboard')} className="mt-8 bg-careem-primary text-white font-bold py-3 px-8 rounded-xl hover:bg-careem-dark transition shadow-lg shadow-green-200">
                     Управление подпиской
                 </button>
             </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredExecutors.map(executor => (
            <div 
              key={executor.id} 
              className={`bg-white rounded-3xl shadow-sm border overflow-hidden hover:shadow-xl transition-all duration-300 group ${executor.isSubscribed ? 'border-green-200 ring-2 ring-careem-light' : 'border-gray-100'}`}
            >
              <div className="relative h-56">
                <img src={executor.avatar} alt={executor.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-700 max-w-full" />
                {executor.isSubscribed && (
                  <div className="absolute top-4 left-4 bg-careem-primary text-white text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-2 shadow-xl">
                    <i className="fas fa-shield-check"></i> Надежный выбор
                  </div>
                )}
                <div className="absolute top-4 right-4 bg-white/95 backdrop-blur px-2.5 py-1.5 rounded-xl text-xs font-black text-gray-900 shadow-sm border border-gray-100 flex items-center gap-1">
                  <i className="fas fa-star text-yellow-400"></i> 
                  <span>{executor.rating}</span>
                  {executor.reviewsCount ? <span className="text-gray-400 font-medium text-[10px] ml-0.5">({executor.reviewsCount})</span> : null}
                </div>
              </div>
              <div className="p-8">
                <h3 className="text-2xl font-black text-gray-900 mb-2 group-hover:text-careem-primary transition">{executor.name}</h3>
                <p className="text-sm text-gray-500 mb-4 flex items-center font-medium">
                  <i className="fas fa-location-dot text-careem-primary mr-2"></i> 
                  {(() => {
                     // Try to get city name
                     let city = executor.location;
                     if (!city && executor.locationCoordinates?.address) {
                       const parts = executor.locationCoordinates.address.split(', ');
                       // Heuristic: try to find a part that looks like a city (no numbers, not 'Россия')
                       // Usually city is after country/region or at the end
                       // For Russia: Country, Region, City, Street...
                       // Let's try to find a known city marker or just take a middle part
                       city = parts.find(p => !/\d/.test(p) && p.trim() !== 'Россия' && !p.includes('область') && !p.includes('край') && !p.includes('округ')) || parts[0];
                     }
                     
                     return (
                       <span>
                         {city || 'Локация не указана'}
                         {executor.coverageRadius && (
                           <span className="ml-2 bg-careem-light text-careem-primary px-2 py-0.5 rounded text-xs border border-green-100">
                             Охват {executor.coverageRadius} км
                           </span>
                         )}
                       </span>
                     );
                  })()}
                </p>
                
                {/* Last Review Snippet */}
                {executor.reviews && executor.reviews.length > 0 && (
                  <div className="mb-4 bg-careem-light/50 p-3 rounded-xl border border-green-50">
                    <p className="text-xs text-gray-600 italic line-clamp-2">
                      <i className="fas fa-quote-left text-green-200 mr-2"></i>
                      {executor.reviews[executor.reviews.length - 1].text}
                    </p>
                  </div>
                )}

                <p className="text-gray-600 text-sm line-clamp-2 mb-8 h-10 leading-relaxed">
                  {executor.description}
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => onViewProfile(executor)}
                    className="flex-1 bg-gray-50 text-careem-primary font-bold py-3 rounded-2xl border border-green-100 hover:bg-careem-light transition-colors text-sm"
                  >
                    Профиль
                  </button>
                  <button 
                    onClick={() => onBook(executor)}
                    className="flex-1 bg-careem-primary text-white font-bold py-3 rounded-2xl hover:bg-careem-dark transition shadow-lg shadow-green-100 text-sm"
                  >
                    Заказать
                  </button>
                </div>
              </div>
            </div>
          ))}
          </div>
          )
        )}
      </section>

      {/* Benefits Section */}
      <section className="bg-careem-dark py-20">
         <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-12 text-center text-white">
            <div className="space-y-4">
               <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto text-2xl border border-white/10 shadow-inner">
                  <i className="fas fa-check-circle"></i>
               </div>
               <h4 className="text-xl font-bold">Верификация</h4>
               <p className="text-green-100 text-sm font-light leading-relaxed">Проверяем документы и опыт каждого исполнителя для вашей безопасности.</p>
            </div>
            <div className="space-y-4">
               <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto text-2xl border border-white/10 shadow-inner">
                  <i className="fas fa-clock"></i>
               </div>
               <h4 className="text-xl font-bold">Быстрый отклик</h4>
               <p className="text-green-100 text-sm font-light leading-relaxed">Среднее время ответа на запрос составляет менее 15 минут.</p>
            </div>
            <div className="space-y-4">
               <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto text-2xl border border-white/10 shadow-inner">
                  <i className="fas fa-coins"></i>
               </div>
               <h4 className="text-xl font-bold">Прозрачная цена</h4>
               <p className="text-green-100 text-sm font-light leading-relaxed">Вы платите только за фактически оказанное время без скрытых комиссий.</p>
            </div>
         </div>
      </section>
    </div>
  );
};

export default Landing;
