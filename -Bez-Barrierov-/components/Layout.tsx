
import React, { useState, useEffect } from 'react';
import { User, UserRole, Order, OrderStatus } from '../types';
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

  const showMainLink = currentPath === '/dashboard' || currentPath.startsWith('/users/') || currentPath.startsWith('/orders/create');

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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link 
              to="/"
              className="flex items-center cursor-pointer"
            >
              <div className="bg-careem-primary text-white p-2 rounded-lg mr-2">
                <i className="fas fa-expand-arrows-alt text-xl"></i>
              </div>
              <span className="font-bold text-xl text-careem-dark hidden sm:inline tracking-tight">Без Барьеров</span>
            </Link>

            <nav className="flex space-x-1 sm:space-x-4">
              {user ? (
                <>
                  <Link 
                    to={showMainLink ? "/" : "/dashboard"}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition ${showMainLink ? 'text-gray-600 hover:text-careem-primary' : 'bg-green-100 text-careem-primary'}`}
                  >
                    {showMainLink ? (
                      <><i className="fas fa-home mr-1"></i> Главная</>
                    ) : (
                      <span className="relative flex items-center">
                        <i className="fas fa-columns mr-1"></i> Панель
                        {user.role === UserRole.EXECUTOR && user.subscriptionStatus !== 'active' && openOrdersCount > 0 && (
                          <span className="absolute -top-1 -right-2 flex h-2.5 w-2.5">
                             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                             <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                          </span>
                        )}
                      </span>
                    )}
                  </Link>
                  {user.role === UserRole.ADMIN && (
                    <Link 
                      to="/admin"
                      className={`px-3 py-2 rounded-md text-sm font-medium transition ${currentPath === '/admin' ? 'bg-green-100 text-careem-primary' : 'text-gray-600 hover:text-careem-primary'}`}
                    >
                      <i className="fas fa-shield-halved mr-1"></i> Админ
                    </Link>
                  )}
                  <button 
                    onClick={handleLogout}
                    className="px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 transition"
                  >
                    <i className="fas fa-sign-out-alt mr-1"></i> Выйти
                  </button>
                </>
              ) : (
                <>
                  <Link 
                    to="/auth"
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-careem-primary transition flex items-center"
                  >
                    Войти
                  </Link>
                  <Link 
                    to="/auth?mode=register&role=EXECUTOR"
                    className="px-4 py-2 bg-careem-primary text-white text-sm font-medium rounded-lg hover:bg-green-700 transition shadow-sm flex items-center"
                  >
                    Стать помощником
                  </Link>
                </>
              )}
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-grow">
        {children}
      </main>

      <footer className="bg-gray-100 border-t py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="font-bold text-careem-dark mb-4 tracking-tight text-lg">
                <i className="fas fa-expand-arrows-alt mr-2"></i>
                Без Барьеров
              </h3>
              <p className="text-xs text-gray-400 italic max-w-xs leading-relaxed">
                Сервис по поиску сопровождения и профессиональной помощи для людей с ограниченной мобильностью.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-careem-dark mb-4">
                <i className="fas fa-compass mr-2"></i>
                Навигация
              </h4>
              <ul className="text-sm text-gray-600 space-y-2">
                <li><Link to="/" className="hover:text-careem-primary">Главная</Link></li>
                <li><Link to="/auth" className="hover:text-careem-primary">Поиск помощников</Link></li>
                <li><Link to="/auth?mode=register&role=EXECUTOR" className="hover:text-careem-primary">Стать помощником</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-careem-dark mb-4">
                <i className="fas fa-file-contract mr-2"></i>
                Юридическая информация
              </h4>
              <ul className="text-sm text-gray-600 space-y-2 mb-2">
                <li><Link to="/terms" className="hover:text-careem-primary">Публичная оферта</Link></li>
              </ul>
              <p className="text-xs text-gray-400 italic">
                «Платформа предоставляет сервис для поиска и заказа услуг сопровождения и помощи в передвижении. Все услуги оказываются исполнителями напрямую...»
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
