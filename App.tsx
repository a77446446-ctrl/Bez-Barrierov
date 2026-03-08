import React, { Suspense, lazy } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { UserRole, OrderStatus, User } from './types';
import Layout from './components/Layout';
const Landing = lazy(() => import('./pages/Landing'));
const Auth = lazy(() => import('./pages/Auth'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Admin = lazy(() => import('./pages/Admin'));
const Terms = lazy(() => import('./pages/Terms'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const CreateOrder = lazy(() => import('./pages/CreateOrder'));
const Executors = lazy(() => import('./pages/Executors'));
const OpenOrders = lazy(() => import('./pages/OpenOrders'));
import { useAuth } from './context/AuthContext';
import { Toaster, toast } from 'react-hot-toast';

import ErrorBoundary from './components/ErrorBoundary';

const App: React.FC = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050913] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#2D6BFF] border-t-transparent"></div>
          <div className="text-slate-400 font-medium animate-pulse">Загрузка...</div>
        </div>
      </div>
    );
  }

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
          <Suspense fallback={
            <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#3B82F6] border-t-transparent"></div>
                <div className="text-slate-400 font-medium animate-pulse">Загрузка…</div>
              </div>
            </div>
          }>
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
          </Suspense>
        </Layout>
    </ErrorBoundary>
  );
};


export default App;
