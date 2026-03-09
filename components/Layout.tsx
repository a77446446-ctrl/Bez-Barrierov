
import React, { useState, useEffect } from 'react';
import { UserRole, Order, OrderStatus } from '../types';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../services/supabaseClient';
import { LayoutGrid, UserCircle, ClipboardList, LogIn } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const currentTab = new URLSearchParams(location.search).get('tab');

  const [openOrdersCount, setOpenOrdersCount] = useState(0);
  const [isGlobalModalOpen, setIsGlobalModalOpen] = useState(false);

  // PWA Install Prompt State
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
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  useEffect(() => {
    const onOpen = () => setIsGlobalModalOpen(true);
    const onClose = () => setIsGlobalModalOpen(false);
    window.addEventListener('global-modal-open', onOpen as any);
    window.addEventListener('global-modal-close', onClose as any);
    return () => {
      window.removeEventListener('global-modal-open', onOpen as any);
      window.removeEventListener('global-modal-close', onClose as any);
    };
  }, []);

  useEffect(() => {
    if (user?.role === UserRole.EXECUTOR) {

      const checkOrders = async (signal?: AbortSignal) => {
        const supabase = getSupabase();
        if (!supabase) return;
        try {
          const { count: openCount, error: openError } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', OrderStatus.OPEN)
            .abortSignal(signal || new AbortController().signal);

          if (openError) throw openError;

          const { count: mineCount, error: mineError } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('executor_id', user.id)
            .eq('status', OrderStatus.PENDING)
            .abortSignal(signal || new AbortController().signal);

          if (mineError) throw mineError;

          setOpenOrdersCount((openCount || 0) + (mineCount || 0));
        } catch (error: any) {
          const isAbort = error.name === 'AbortError' ||
            (error.message && error.message.includes('AbortError')) ||
            (error.details && error.details.includes('AbortError'));

          if (!isAbort) {
            console.error('Error checking orders:', error);
          }
        }
      };

      const controller = new AbortController();

      // Debounce initial call to avoid React Strict Mode double-invocation in dev
      const timeoutId = setTimeout(() => {
        void checkOrders(controller.signal);
      }, 500);

      const interval = setInterval(() => void checkOrders(controller.signal), 15000);

      return () => {
        clearTimeout(timeoutId);
        clearInterval(interval);
        controller.abort();
      };
    }
  }, [user?.id, user?.role]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const isAuthPage = currentPath === '/auth';
  const showSidebar = !!user && currentPath !== '/auth' && currentPath !== '/';

  const homeItem = user
    ? user.role === UserRole.CUSTOMER
      ? { to: '/executors', label: 'Главная', icon: 'fa-house', isActive: currentPath === '/executors' || currentPath.startsWith('/users/') }
      : { to: '/orders/open', label: 'Главная', icon: 'fa-house', isActive: currentPath === '/orders/open' }
    : { to: '/', label: 'Главная', icon: 'fa-house', isActive: currentPath === '/' };

  const navItems: Array<{ to: string; label: string; icon: string; isActive: boolean }> = [
    homeItem,
    {
      to: user ? '/dashboard?tab=orders' : '/auth',
      label: 'Мой кабинет',
      icon: 'fa-user-circle',
      isActive: user ? currentPath === '/dashboard' && (currentTab === 'orders' || !currentTab) : currentPath === '/auth'
    },
  ];

  return (
    <>
      {isInstallable && (
        <div className="fixed top-0 inset-x-0 z-[200] bg-careem-primary border-b border-blue-400 text-white px-4 py-3 flex items-center justify-between shadow-2xl animate-in slide-in-from-top duration-500">
          <div className="flex items-center gap-3">
            <img src="/logo.png?v=1" alt="App Icon" className="w-10 h-10 rounded-xl shadow-md border border-white/20" />
            <div>
              <p className="font-display font-bold text-sm">БезБарьеров</p>
              <p className="text-xs text-blue-100 font-medium">Установите приложение для быстрого доступа</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              onClick={handleInstallClick}
              className="px-3 sm:px-4 py-1.5 bg-white text-careem-primary font-bold rounded-xl text-xs sm:text-sm shadow-[0_0_15px_rgba(255,255,255,0.4)] hover:bg-blue-50 transition active:scale-95"
            >
              Установить
            </button>
            <button
              onClick={() => setIsInstallable(false)}
              className="p-2 text-blue-200 hover:text-white transition rounded-full hover:bg-black/10"
              aria-label="Закрыть"
            >
              <i className="fas fa-times text-lg"></i>
            </button>
          </div>
        </div>
      )}
      <div className={`min-h-screen bg-careem-dark text-slate-100 overflow-x-hidden selection:bg-careem-primary/30 ${isInstallable ? 'pt-[68px]' : ''}`}>
        <div
          className={`min-h-screen ${isAuthPage ? 'flex items-center justify-center px-4 py-12' : showSidebar ? 'flex flex-col md:flex-row' : 'flex flex-col'}`}
        >
          {showSidebar && (
            <>
              {!isGlobalModalOpen && (
                <header className="md:hidden sticky top-0 z-[150] border-b border-white/5 bg-careem-dark/60 backdrop-blur-2xl saturate-150">
                  <div className="px-5 py-4 flex items-center justify-between gap-3">
                    <Link to="/" className="flex items-center gap-3 min-w-0 group">
                      <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-careem-accent to-careem-primary flex items-center justify-center shadow-lg shadow-careem-primary/20 shrink-0 group-hover:scale-105 transition-transform duration-300">
                        <i className="fas fa-universal-access text-white text-[15px]"></i>
                      </div>
                      <div className="font-display font-bold text-lg tracking-tight truncate text-white">БезБарьеров</div>
                    </Link>
                    {user ? (
                      <button
                        onClick={handleLogout}
                        className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center text-slate-300 shrink-0"
                        title="Выйти"
                      >
                        <i className="fas fa-arrow-right-from-bracket text-sm"></i>
                      </button>
                    ) : (
                      <Link
                        to="/auth"
                        className="inline-flex items-center justify-center rounded-2xl bg-careem-primary hover:bg-careem-accent transition text-white font-medium px-5 py-2.5 shadow-[0_0_20px_rgba(37,99,235,0.3)] inset-2 shrink-0 text-sm"
                      >
                        Войти
                      </Link>
                    )}
                  </div>
                </header>
              )}

              <aside className="hidden md:flex md:flex-col w-[280px] shrink-0 border-r border-white/5 bg-careem-dark/40 backdrop-blur-2xl relative">
                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none"></div>

                <div className="px-6 py-8 relative z-10">
                  <Link to="/" className="flex items-center gap-3.5 group">
                    <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-careem-accent to-careem-primary flex items-center justify-center shadow-lg shadow-careem-primary/20 group-hover:scale-105 transition-transform duration-300">
                      <i className="fas fa-universal-access text-white text-[17px]"></i>
                    </div>
                    <div className="font-display font-bold text-xl tracking-tight text-white">БезБарьеров</div>
                  </Link>
                </div>

                <nav className="px-4 relative z-10">
                  <div className="space-y-1.5">
                    {navItems.map((item) => (
                      <Link
                        key={item.label}
                        to={item.to}
                        className={[
                          'flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-[15px] transition-all duration-200 relative overflow-hidden group',
                          item.isActive
                            ? 'text-white'
                            : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
                        ].join(' ')}
                      >
                        {item.isActive && (
                          <div className="absolute inset-0 bg-gradient-to-r from-careem-primary/20 to-transparent border-l-2 border-careem-primary"></div>
                        )}

                        <i className={`fas ${item.icon} z-10 text-[16px] transition-colors ${item.isActive ? 'text-careem-primary drop-shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'text-zinc-500 group-hover:text-zinc-400'}`}></i>
                        <span className="z-10 font-medium">{item.label}</span>
                        {item.label === 'Настройки' &&
                          user?.role === UserRole.EXECUTOR &&
                          user.subscriptionStatus !== 'active' &&
                          openOrdersCount > 0 && (
                            <span className="ml-auto h-2 w-2 rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.15)]" />
                          )}
                      </Link>
                    ))}
                  </div>
                </nav>

                <div className="mt-auto px-4 pb-6 pt-6 relative z-10">
                  {user ? (
                    <div className="rounded-3xl border border-white/5 bg-careem-light/40 backdrop-blur-md p-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
                      <div className="flex items-center gap-3.5">
                        <div className="h-11 w-11 rounded-full overflow-hidden bg-white/10 ring-2 ring-white/5 shrink-0 shadow-inner">
                          {user.avatar ? (
                            <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-zinc-400 bg-zinc-800">
                              <i className="fas fa-user mb-1"></i>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[15px] font-semibold text-white truncate font-display">{user.name}</div>
                          <div className="text-[13px] text-zinc-400 truncate">
                            {user.role === UserRole.ADMIN
                              ? 'Администратор'
                              : user.role === UserRole.EXECUTOR
                                ? 'Помощник'
                                : 'Заказчик'}
                          </div>
                        </div>
                        <button
                          onClick={handleLogout}
                          className="h-10 w-10 flex shrink-0 rounded-full hover:bg-white/10 transition items-center justify-center text-zinc-400 hover:text-white group"
                          title="Выйти"
                        >
                          <i className="fas fa-arrow-right-from-bracket text-sm group-hover:translate-x-0.5 transition-transform"></i>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Link
                      to="/auth"
                      className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-careem-primary/10 hover:bg-careem-primary/20 border border-careem-primary/20 transition text-careem-primary font-medium py-3.5 shadow-lg"
                    >
                      Войти в систему
                    </Link>
                  )}
                </div>
              </aside>

              <nav
                className="md:hidden fixed bottom-0 inset-x-0 z-[160] pb-safe"
                style={{
                  background: 'rgba(18, 18, 18, 0.7)',
                  backdropFilter: 'blur(15px)',
                  WebkitBackdropFilter: 'blur(15px)',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)'
                }}
              >
                <div className="px-3 py-2 grid grid-cols-2 gap-2 w-full max-w-md mx-auto relative">
                  {navItems.map((item) => (
                    <Link
                      key={item.label}
                      to={item.to}
                      className={[
                        'flex flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-[11px] font-medium transition-all relative',
                        item.isActive ? 'text-[#3B82F6]' : 'text-zinc-500 hover:text-zinc-300'
                      ].join(' ')}
                    >
                      {item.isActive && (
                        <div className="absolute inset-0 rounded-2xl" style={{ boxShadow: '0 6px 18px rgba(59,130,246,0.25)' }}></div>
                      )}
                      <span className="z-10">
                        {(() => {
                          if (item.label === 'Главная') {
                            return <LayoutGrid size={20} color={item.isActive ? '#3B82F6' : '#9ca3af'} style={item.isActive ? { filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.6))' } : undefined} />;
                          }
                          if (item.label === 'Мой кабинет') {
                            if (!user) {
                              return <LogIn size={20} color={item.isActive ? '#3B82F6' : '#9ca3af'} style={item.isActive ? { filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.6))' } : undefined} />;
                            }
                            return <UserCircle size={20} color={item.isActive ? '#3B82F6' : '#9ca3af'} style={item.isActive ? { filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.6))' } : undefined} />;
                          }
                          return <LayoutGrid size={20} color={item.isActive ? '#3B82F6' : '#9ca3af'} />;
                        })()}
                      </span>
                      <span className="whitespace-nowrap z-10 tracking-wide">{item.label}</span>
                      {item.label === 'Настройки' &&
                        user?.role === UserRole.EXECUTOR &&
                        user.subscriptionStatus !== 'active' &&
                        openOrdersCount > 0 && (
                          <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.15)]" />
                        )}
                    </Link>
                  ))}
                </div>
              </nav>
            </>
          )}

          <main
            className={`${isAuthPage ? 'w-full max-w-md' : showSidebar ? 'flex-1 min-w-0 px-4 md:px-8 pt-6 pb-24 md:py-10' : 'w-full'}`}
          >
            {children}
          </main>
        </div>
      </div>
    </>
  );
};

export default Layout;
