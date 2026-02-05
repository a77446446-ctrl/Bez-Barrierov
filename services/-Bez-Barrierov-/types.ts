
export enum UserRole {
  CUSTOMER = 'CUSTOMER', // Disabled person
  EXECUTOR = 'EXECUTOR', // Helper
  ADMIN = 'ADMIN'
}

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface User {
  id: string;
  role: UserRole;
  name: string;
  email: string;
  phone: string;
  telegramId?: string;
  avatar?: string;
  isSubscribed?: boolean;
  rating?: number;
  location?: string;
  description?: string;
}

export interface ServiceType {
  id: string;
  name: string;
  pricePerHour: number;
}

export interface Order {
  id: string;
  customerId: string;
  executorId: string;
  serviceType: string;
  date: string;
  time: string;
  status: OrderStatus;
  totalPrice: number;
  details?: string;
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  timestamp: string;
  read: boolean;
  source: 'WEB' | 'TELEGRAM';
}
