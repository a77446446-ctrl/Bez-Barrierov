
import React, { useState, useEffect } from 'react';
import { UserRole, Order, OrderStatus } from '../types';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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

  useEffect(() => {
    if (user?.role === UserRole.EXECUTOR) {
      const checkOrders = () => {
        const stored = localStorage.getItem('bez_barrierov_orders');
        if (stored) {
          const orders: Order[] = JSON.parse(stored);
          const count = orders.filter(o => 
            o.status === OrderStatus.OPEN || 
            (o.executorId === user.id && 
             o.status !== OrderStatus.COMPLETED && 
             o.status !== OrderStatus.CANCELLED && 
             o.status !== OrderStatus.REJECTED)
          ).length;
          setOpenOrdersCount(count);
        }
      };

      checkOrders();
      // Poll every 5 seconds to update count
      const interval = setInterval(checkOrders, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isAuthPage = currentPath === '/auth';
  const showSidebar = currentPath !== '/auth' && currentPath !== '/';

  const homeItem = user
    ? user.role === UserRole.CUSTOMER
      ? { to: '/executors', label: 'Главная', icon: 'fa-house', isActive: currentPath === '/executors' || currentPath.startsWith('/users/') }
      : { to: '/orders/open', label: 'Главная', icon: 'fa-house', isActive: currentPath === '/orders/open' }
    : { to: '/', label: 'Главная', icon: 'fa-house', isActive: currentPath === '/' };

  const navItems: Array<{ to: string; label: string; icon: string; isActive: boolean }> = [
    homeItem,
    {
      to: user ? '/dashboard?tab=profile' : '/auth',
      label: 'Настройки',
      icon: 'fa-gear',
      isActive: user ? currentPath === '/dashboard' && currentTab === 'profile' : currentPath === '/auth'
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#050913] via-[#070B14] to-[#04060D] text-slate-100 overflow-x-hidden">
      <div
        className={`min-h-screen ${isAuthPage ? 'flex items-center justify-center px-4 py-12' : showSidebar ? 'flex flex-col md:flex-row' : 'flex flex-col'}`}
      >
        {showSidebar && (
          <>
            <header className="md:hidden sticky top-0 z-[150] border-b border-white/5 bg-[#0B1220]/85 backdrop-blur-xl">
              <div className="px-4 py-4 flex items-center justify-between gap-3">
                <Link to={homeItem.to} className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#2D6BFF] to-[#1A3FA8] flex items-center justify-center shadow-lg shadow-[#2D6BFF]/20 shrink-0">
                    <i className="fas fa-square text-white text-sm"></i>
                  </div>
                  <div className="font-semibold tracking-tight truncate">БезБарьеров</div>
                </Link>

                {user ? (
                  <button
                    onClick={handleLogout}
                    className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center text-slate-200 shrink-0"
                    title="Выйти"
                  >
                    <i className="fas fa-arrow-right-from-bracket text-sm"></i>
                  </button>
                ) : (
                  <Link
                    to="/auth"
                    className="inline-flex items-center justify-center rounded-xl bg-[#2D6BFF] hover:bg-[#255EE6] transition text-white font-semibold px-4 py-2 shadow-lg shadow-[#2D6BFF]/20 shrink-0"
                  >
                    Войти
                  </Link>
                )}
              </div>
            </header>

            <aside className="hidden md:flex md:flex-col w-[260px] shrink-0 border-r border-white/5 bg-[#0B1220]/85 backdrop-blur-xl">
            <div className="px-5 py-6">
              <Link to={homeItem.to} className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#2D6BFF] to-[#1A3FA8] flex items-center justify-center shadow-lg shadow-[#2D6BFF]/20">
                  <i className="fas fa-square text-white text-sm"></i>
                </div>
                <div className="font-semibold tracking-tight">БезБарьеров</div>
              </Link>
            </div>

            <nav className="px-3">
              <div className="space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    className={[
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition',
                      item.isActive
                        ? 'bg-[#13213A] text-white border border-[#1B2D4F] shadow-sm'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent'
                    ].join(' ')}
                  >
                    <i className={`fas ${item.icon} text-[14px] ${item.isActive ? 'text-[#2D6BFF]' : 'text-slate-500'}`}></i>
                    <span>{item.label}</span>
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

            <div className="mt-auto px-5 pb-6 pt-6">
              {user ? (
                <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl overflow-hidden bg-white/10 border border-white/10 shrink-0">
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-slate-300">
                          <i className="fas fa-user"></i>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{user.name}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {user.role === UserRole.ADMIN
                          ? 'Администратор'
                          : user.role === UserRole.EXECUTOR
                            ? 'Помощник'
                            : 'Заказчик'}
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="ml-auto h-10 w-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center text-slate-200"
                      title="Выйти"
                    >
                      <i className="fas fa-arrow-right-from-bracket text-sm"></i>
                    </button>
                  </div>
                </div>
              ) : (
                <Link
                  to="/auth"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#2D6BFF] hover:bg-[#255EE6] transition text-white font-semibold py-3 shadow-lg shadow-[#2D6BFF]/20"
                >
                  Войти в систему
                </Link>
              )}
            </div>
          </aside>

          <nav className="md:hidden fixed bottom-0 inset-x-0 z-[160] border-t border-white/5 bg-[#0B1220]/90 backdrop-blur-xl">
            <div className="px-4 py-3 grid grid-cols-2 gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className={[
                    'flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-medium transition border',
                    item.isActive
                      ? 'bg-[#13213A] text-white border-[#1B2D4F]'
                      : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
                  ].join(' ')}
                >
                  <i className={`fas ${item.icon} text-[14px] ${item.isActive ? 'text-[#2D6BFF]' : 'text-slate-500'}`}></i>
                  <span>{item.label}</span>
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
  );
};

export default Layout;
