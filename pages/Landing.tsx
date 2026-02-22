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
      <section className="px-4 pt-10 pb-6">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05] text-slate-100 drop-shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
            Мир{' '}
            <span className="bg-gradient-to-r from-careem-primary to-[#2D6BFF] bg-clip-text text-transparent">
              без границ
            </span>{' '}
            для каждого.
          </h1>
          <p className="mt-4 text-sm md:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Профессиональное сопровождение и помощь для людей с ограниченной мобильностью.
          </p>
        </div>
      </section>

      <section className="px-4 pb-10">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="max-w-2xl">
                <h2 className="text-2xl md:text-3xl font-black tracking-tight text-slate-100">
                  О проекте «Без барьеров»
                </h2>
                <p className="mt-3 text-sm md:text-base text-slate-300 leading-relaxed">
                  Это сервис, который помогает людям с ограниченной мобильностью находить помощников для сопровождения,
                  перемещений по городу и повседневных задач. Наша цель — сделать доступ к помощи понятным, быстрым и
                  безопасным.
                </p>

                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => navigate('/terms')}
                    className="rounded-xl bg-transparent hover:bg-white/5 transition text-slate-200 font-semibold py-3 px-5 border border-white/10 flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-file-contract"></i>
                    Правила сервиса
                  </button>
                </div>
              </div>

              <div className="w-full md:max-w-md">
                <div className="rounded-3xl border border-white/10 bg-[#0B1220]/35 p-4 md:p-5">
                  <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Ключевые возможности</p>
                  <div className="mt-4 grid gap-3">
                    <div className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-4 hover:border-white/20 hover:bg-white/5 transition">
                      <div className="flex items-start gap-3">
                        <div>
                          <div className="w-11 h-11 rounded-2xl bg-careem-primary/20 text-careem-primary flex items-center justify-center">
                            <i className="fas fa-wheelchair"></i>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-100 leading-tight">Для кого</p>
                          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                            Люди с ограниченной мобильностью и их близкие
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-4 hover:border-white/20 hover:bg-white/5 transition">
                      <div className="flex items-start gap-3">
                        <div>
                          <div className="w-11 h-11 rounded-2xl bg-careem-primary/20 text-careem-primary flex items-center justify-center">
                            <i className="fas fa-route"></i>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-100 leading-tight">Маршрут</p>
                          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                            Планирование и отображение на карте
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-4 hover:border-white/20 hover:bg-white/5 transition">
                      <div className="flex items-start gap-3">
                        <div>
                          <div className="w-11 h-11 rounded-2xl bg-careem-primary/20 text-careem-primary flex items-center justify-center">
                            <i className="fas fa-handshake-angle"></i>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-100 leading-tight">Как работает</p>
                          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                            Выбор помощника, заказ, статусы выполнения
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-4 hover:border-white/20 hover:bg-white/5 transition">
                      <div className="flex items-start gap-3">
                        <div>
                          <div className="w-11 h-11 rounded-2xl bg-careem-primary/20 text-careem-primary flex items-center justify-center">
                            <i className="fas fa-magnifying-glass"></i>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-100 leading-tight">Умный подбор</p>
                          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                            Подсказки по запросу и рекомендациям
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {!user && (
                  <div className="mt-4 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => navigate('/auth?mode=login')}
                      className="rounded-xl bg-careem-primary hover:bg-[#255EE6] transition text-white font-semibold py-3 px-5 shadow-lg shadow-[#2D6BFF]/20 flex items-center justify-center gap-2"
                    >
                      <i className="fas fa-right-to-bracket"></i>
                      Войти
                    </button>
                    <button
                      onClick={() => navigate('/auth?mode=register&role=CUSTOMER')}
                      className="rounded-xl bg-white/10 hover:bg-white/15 transition text-slate-100 font-semibold py-3 px-5 border border-white/10 flex items-center justify-center gap-2"
                    >
                      <i className="fas fa-user-plus"></i>
                      Регистрация
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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
