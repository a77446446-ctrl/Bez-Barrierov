import React, { useState, useEffect } from 'react';
import { User, UserRole, ServiceType, Order, OrderStatus } from '../types';
import { SERVICE_TYPES } from '../constants';
import { getSmartRecommendations } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import OrderMap from '../components/OrderMap';
import { getSupabase } from '../services/supabaseClient';
import { profileRowToUser, orderRowToOrder } from '../services/mappers';

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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

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
    let isActive = true;
    const supabase = getSupabase();

    const loadData = async () => {
      if (supabase) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', UserRole.EXECUTOR)
          .eq('profile_verification_status', 'verified')
          .order('created_at', { ascending: true });
        if (isActive && !error && Array.isArray(data)) {
          setExecutors(data.map(profileRowToUser));
        }
      } else if (isActive) {
        setExecutors([]);
      }

      if (user?.role === UserRole.EXECUTOR) {
        if (supabase) {
          const { data } = await supabase.from('orders').select('*').eq('status', OrderStatus.OPEN).order('created_at', { ascending: false });
          const orders = Array.isArray(data) ? data.map(orderRowToOrder) : [];
          setAvailableOrders(orders);
        } else {
          setAvailableOrders([]);
        }
      }
    };

    void loadData();
    return () => {
      isActive = false;
    };
  }, [user]);

  const handleSmartSearch = async () => {
    if (!searchTerm) return;
    setIsAiLoading(true);
    const recs = await getSmartRecommendations(searchTerm, executors);
    setAiRecs(recs || null);
    setIsAiLoading(false);
  };

  const handleTakeOrder = async (orderId: string) => {
    const supabase = getSupabase();
    if (!supabase || !user) return;
    await supabase.from('orders').update({ status: OrderStatus.CONFIRMED, executor_id: user.id, responses: [] }).eq('id', orderId);
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
    <div className="animate-in fade-in duration-500 relative">
      {!user && (
        <header className="sticky top-0 z-50 border-b border-white/5 bg-careem-dark/60 backdrop-blur-2xl saturate-150">
          <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3.5 group">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-careem-accent to-careem-primary flex items-center justify-center shadow-lg shadow-careem-primary/20 group-hover:scale-105 transition-transform duration-300">
                <i className="fas fa-universal-access text-white text-[15px]"></i>
              </div>
              <div className="font-display font-bold text-xl tracking-tight text-white">БезБарьеров</div>
            </div>
          </div>
        </header>
      )}

      <section className="px-4 pt-16 pb-12 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-careem-primary/10 via-careem-dark to-careem-dark pointer-events-none -z-10"></div>
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <h1 className="font-display text-5xl md:text-7xl lg:text-[5rem] font-bold tracking-tight leading-[1.05] text-white">
            Мир{' '}
            <span className="bg-gradient-to-r from-blue-400 to-careem-primary bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(37,99,235,0.4)]">
              без границ
            </span>{' '}
            <br className="hidden md:block" />
            для каждого.
          </h1>
          <p className="mt-8 text-base md:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed font-light">
            Профессиональное сопровождение и помощь для людей с ограниченной мобильностью. <br className="hidden sm:block" />
            Безопасно, прозрачно и с заботой.
          </p>
        </div>
      </section>

      <section className="px-4 pb-16 relative z-10">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-[2.5rem] border border-white/5 bg-careem-light/60 backdrop-blur-2xl p-7 md:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden group">
            {/* Decorative background effects */}
            <div className="absolute -top-32 -right-32 w-96 h-96 bg-careem-primary/10 rounded-full blur-3xl pointer-events-none transition-transform duration-700 group-hover:scale-110"></div>
            <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none transition-transform duration-700 group-hover:scale-110"></div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-10 relative z-10">
              <div className="max-w-xl">
                <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">
                  О проекте «Без барьеров»
                </h2>
                <p className="text-[15px] md:text-base text-zinc-300 leading-relaxed font-light">
                  Это премиальный сервис, который помогает людям с ограниченной мобильностью находить персональных помощников для сопровождения,
                  перемещений по городу и повседневных задач. Наша цель — сделать помощь доступной, прозрачной и абсолютно безопасной.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={() => navigate('/terms')}
                    className="rounded-2xl bg-white/5 hover:bg-white/10 transition text-zinc-300 font-medium py-3.5 px-6 border border-white/10 flex items-center justify-center gap-2.5"
                  >
                    <i className="fas fa-file-contract text-zinc-400"></i>
                    Правила сервиса
                  </button>
                  {isInstallable && (
                    <button
                      onClick={handleInstallClick}
                      className="rounded-2xl bg-careem-primary transition-all hover:bg-careem-accent hover:shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:-translate-y-0.5 text-white font-medium py-3.5 px-6 shadow-lg shadow-careem-primary/25 flex items-center justify-center gap-2.5"
                    >
                      <i className="fas fa-download"></i>
                      Установить PWA
                    </button>
                  )}
                </div>
              </div>

              <div className="w-full md:max-w-[400px] shrink-0">
                <div className="rounded-3xl border border-white/5 bg-black/20 p-6 backdrop-blur-md">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-1.5 w-1.5 rounded-full bg-careem-accent shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
                    <p className="text-[11px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Преимущества</p>
                  </div>

                  <div className="grid gap-4">
                    <div className="group flex items-start gap-4 p-3 -mx-3 rounded-2xl hover:bg-white/[0.03] transition-colors">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 text-careem-accent flex items-center justify-center ring-1 ring-white/10 shadow-inner group-hover:scale-110 transition-transform">
                        <i className="fas fa-wheelchair text-lg"></i>
                      </div>
                      <div className="min-w-0 pt-1">
                        <p className="text-[15px] font-semibold text-white leading-tight mb-1">Инклюзивность</p>
                        <p className="text-sm text-zinc-400 leading-relaxed font-light">Доступная среда для людей с ограниченной мобильностью</p>
                      </div>
                    </div>

                    <div className="group flex items-start gap-4 p-3 -mx-3 rounded-2xl hover:bg-white/[0.03] transition-colors">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 text-careem-accent flex items-center justify-center ring-1 ring-white/10 shadow-inner group-hover:scale-110 transition-transform">
                        <i className="fas fa-route text-lg"></i>
                      </div>
                      <div className="min-w-0 pt-1">
                        <p className="text-[15px] font-semibold text-white leading-tight mb-1">Маршрутизация</p>
                        <p className="text-sm text-zinc-400 leading-relaxed font-light">Планирование поездок прямо на интерактивной карте</p>
                      </div>
                    </div>

                    <div className="group flex items-start gap-4 p-3 -mx-3 rounded-2xl hover:bg-white/[0.03] transition-colors">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 text-careem-accent flex items-center justify-center ring-1 ring-white/10 shadow-inner group-hover:scale-110 transition-transform">
                        <i className="fas fa-shield-halved text-lg"></i>
                      </div>
                      <div className="min-w-0 pt-1">
                        <p className="text-[15px] font-semibold text-white leading-tight mb-1">Безопасность</p>
                        <p className="text-sm text-zinc-400 leading-relaxed font-light">Тщательно проверенные верифицированные исполнители</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row gap-4">
                  {user ? (
                    <button
                      onClick={() => navigate('/dashboard')}
                      className="w-full rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition text-white font-medium py-4 px-6 flex items-center justify-center gap-2.5 shadow-lg shadow-black/20"
                    >
                      <i className="fas fa-columns text-careem-primary"></i>
                      Вернуться в Мой кабинет
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => navigate('/auth?mode=login')}
                        className="flex-1 rounded-2xl bg-careem-primary hover:bg-careem-accent transition text-white font-medium py-3.5 px-6 shadow-[0_0_20px_rgba(37,99,235,0.3)] flex items-center justify-center gap-2.5"
                      >
                        <i className="fas fa-right-to-bracket"></i>
                        Войти
                      </button>
                      <button
                        onClick={() => navigate('/auth?mode=register&role=CUSTOMER')}
                        className="flex-1 rounded-2xl bg-white/5 hover:bg-white/10 transition text-white font-medium py-3.5 px-6 border border-white/10 flex items-center justify-center gap-2.5"
                      >
                        <i className="fas fa-user-plus text-zinc-400"></i>
                        Регистрация
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-[linear-gradient(to_bottom,transparent,#09090b)] py-20 relative">
        <div className="absolute inset-0 border-t border-white/5"></div>
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 text-center text-white relative z-10">
          <div className="space-y-5 p-6 rounded-3xl hover:bg-white/[0.02] transition-colors">
            <div className="w-16 h-16 bg-gradient-to-br from-white/10 to-transparent rounded-2xl flex items-center justify-center mx-auto text-[28px] border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] text-white">
              <i className="fas fa-address-card"></i>
            </div>
            <h4 className="font-display text-2xl font-bold">Верификация</h4>
            <p className="text-zinc-400 text-[15px] font-light leading-relaxed max-w-[280px] mx-auto">
              Мы тщательно проверяем документы и опыт каждого помощника перед допуском к заказам.
            </p>
          </div>

          <div className="space-y-5 p-6 rounded-3xl hover:bg-white/[0.02] transition-colors relative">
            <div className="md:absolute top-1/2 -left-12 w-px h-24 bg-gradient-to-b from-transparent via-white/10 to-transparent hidden md:block -translate-y-1/2"></div>
            <div className="w-16 h-16 bg-gradient-to-br from-white/10 to-transparent rounded-2xl flex items-center justify-center mx-auto text-[28px] border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] text-white">
              <i className="fas fa-bolt"></i>
            </div>
            <h4 className="font-display text-2xl font-bold">Мгновенный отклик</h4>
            <p className="text-zinc-400 text-[15px] font-light leading-relaxed max-w-[280px] mx-auto">
              Алгоритмы подбирают свободных исполнителей поблизости со средним временем ответа 15 минут.
            </p>
          </div>

          <div className="space-y-5 p-6 rounded-3xl hover:bg-white/[0.02] transition-colors relative">
            <div className="md:absolute top-1/2 -left-12 w-px h-24 bg-gradient-to-b from-transparent via-white/10 to-transparent hidden md:block -translate-y-1/2"></div>
            <div className="w-16 h-16 bg-gradient-to-br from-white/10 to-transparent rounded-2xl flex items-center justify-center mx-auto text-[28px] border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] text-white">
              <i className="fas fa-wallet"></i>
            </div>
            <h4 className="font-display text-2xl font-bold">Прозрачная оплата</h4>
            <p className="text-zinc-400 text-[15px] font-light leading-relaxed max-w-[280px] mx-auto">
              Никаких скрытых списаний и комиссий. Оплата рассчитывается строго по факту заказа.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;
