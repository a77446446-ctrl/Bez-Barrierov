
import React, { useState, useEffect } from 'react';
import { User, UserRole, Order, OrderStatus } from './types';
import { MOCK_USERS } from './constants';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import TelegramBotSim from './components/TelegramBotSim';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState<string>('landing');
  const [notifications, setNotifications] = useState<string[]>([]);

  // Simulation of TG notification arrival
  const addNotification = (msg: string) => {
    setNotifications(prev => [msg, ...prev]);
  };

  const handleLogin = (role: UserRole) => {
    // Basic simulation: pick first user with matching role or admin
    let foundUser;
    if (role === UserRole.ADMIN) {
      foundUser = MOCK_USERS.find(u => u.role === UserRole.ADMIN);
    } else {
      foundUser = MOCK_USERS.find(u => u.role === role);
    }
    setUser(foundUser || null);
    setCurrentPage('dashboard');
    addNotification(`Вы успешно вошли как ${foundUser?.name}`);
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentPage('landing');
    setNotifications([]);
  };

  const handleBook = (executor: User) => {
    if (!user) {
      setCurrentPage('auth');
      return;
    }
    // Simulation
    addNotification(`⏳ Новый запрос на заказ отправлен пользователю ${executor.name}`);
    setTimeout(() => {
      addNotification(`✅ ${executor.name} подтвердил ваш заказ! Подробности в панели.`);
    }, 3000);
    setCurrentPage('dashboard');
  };

  const handleUpdateStatus = (orderId: string, newStatus: OrderStatus) => {
    const statusText = newStatus === OrderStatus.CONFIRMED ? 'подтвержден' : 'отменен';
    addNotification(`🔔 Заказ #${orderId} был ${statusText}`);
  };

  const renderPage = () => {
    switch(currentPage) {
      case 'landing': 
        return <Landing 
          onViewProfile={(e) => alert(`Профиль ${e.name} в разработке`)} 
          onBook={handleBook} 
        />;
      case 'auth': 
        return <Auth onLogin={handleLogin} />;
      case 'dashboard': 
        return user ? <Dashboard user={user} onUpdateStatus={handleUpdateStatus} /> : <Auth onLogin={handleLogin} />;
      case 'admin':
        return user?.role === UserRole.ADMIN ? <Admin /> : <Landing onViewProfile={() => {}} onBook={() => {}} />;
      default: 
        return <Landing onViewProfile={() => {}} onBook={() => {}} />;
    }
  };

  return (
    <>
      <Layout 
        user={user} 
        onLogout={handleLogout} 
        onNavigate={setCurrentPage} 
        currentPage={currentPage}
      >
        {renderPage()}
      </Layout>
      <TelegramBotSim notifications={notifications} />
    </>
  );
};

export default App;
