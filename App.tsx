import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { UserRole, OrderStatus, User } from './types';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Terms from './pages/Terms';
import UserProfile from './pages/UserProfile';
import CreateOrder from './pages/CreateOrder';
import Executors from './pages/Executors';
import OpenOrders from './pages/OpenOrders';
import { useAuth } from './context/AuthContext';
import { Toaster, toast } from 'react-hot-toast';

import ErrorBoundary from './components/ErrorBoundary';

const App: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleBook = (executor: User) => {
    if (!user) {
      navigate('/auth');
      toast('Пожалуйста, войдите в систему для оформления заказа', { icon: '🔒' });
      return;
    }
    navigate(`/orders/create?executorId=${executor.id}`);
  };

  const handleUpdateStatus = (orderId: string, newStatus: OrderStatus, rejectionReason?: string) => {
    // In a real app, this would update the backend
    // For now we'll simulate it by updating local storage if we were using it for orders
    // or just show a toast since MOCK_ORDERS are static constant
    
    let statusText = '';
    switch(newStatus) {
      case OrderStatus.CONFIRMED: statusText = 'подтвержден'; break;
      case OrderStatus.CANCELLED: statusText = 'отменен'; break;
      case OrderStatus.REJECTED: statusText = 'отклонен'; break;
      default: statusText = 'обновлен';
    }
    
    toast.success(`Заказ #${orderId} был ${statusText}`);
  };

  return (
    <ErrorBoundary>
        <Toaster position="top-right" />
        <Layout>
          <Routes>
            <Route path="/" element={
              <Landing 
                onViewProfile={(e) => navigate(`/users/${e.id}`)} 
                onBook={handleBook} 
              />
            } />
            <Route path="/auth" element={<Auth onSuccess={() => navigate('/dashboard')} />} />
            <Route path="/dashboard" element={
              user ? <Dashboard user={user} onUpdateStatus={handleUpdateStatus} /> : <Auth onSuccess={() => navigate('/dashboard')} />
            } />
            <Route path="/admin" element={
              user?.role === UserRole.ADMIN ? <Admin /> : <Landing onViewProfile={() => {}} onBook={() => {}} />
            } />
            <Route path="/executors" element={
              user ? (
                user.role === UserRole.CUSTOMER ? <Executors /> : <Dashboard user={user} onUpdateStatus={handleUpdateStatus} />
              ) : (
                <Auth onSuccess={() => navigate('/executors')} />
              )
            } />
            <Route path="/terms" element={<Terms />} />
            <Route path="/users/:id" element={<UserProfile onBook={(id) => navigate(`/orders/create?executorId=${id}`)} />} />
            <Route path="/orders/create" element={<CreateOrder />} />
            <Route path="/orders/open" element={<OpenOrders />} />
          </Routes>
        </Layout>
    </ErrorBoundary>
  );
};


export default App;
