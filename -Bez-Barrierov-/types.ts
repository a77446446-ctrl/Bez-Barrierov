
export enum UserRole {
  CUSTOMER = 'CUSTOMER', // Disabled person
  EXECUTOR = 'EXECUTOR', // Helper
  ADMIN = 'ADMIN'
}

export enum OrderStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN', // Available for any executor
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED'
}

export interface Location {
  lat: number;
  lng: number;
  address?: string;
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
  reviewsCount?: number;
  reviews?: Review[];
  location?: string;
  locationCoordinates?: Location;
  coverageRadius?: number; // km
  description?: string;
  vehiclePhoto?: string;
  customServices?: {
    serviceId: string;
    price: number;
    enabled: boolean;
  }[];
  // Subscription fields
  subscriptionStatus?: 'none' | 'pending' | 'active' | 'expired';
  subscriptionStartDate?: string; // ISO date
  subscriptionEndDate?: string; // ISO date
  subscribedToCustomerId?: string; // For Executor
  subscriptionRequestToCustomerId?: string; // For Executor (pending)
  subscribedExecutorId?: string; // For Customer
  notifications?: Notification[];
}

export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  date: string;
  read: boolean;
}

export interface ServiceType {
  id: string;
  name: string;
  pricePerHour: number;
}

export interface Order {
  id: string;
  customerId: string;
  executorId?: string; // Optional for open orders
  serviceType: string;
  date: string;
  time: string;
  status: OrderStatus;
  totalPrice: number;
  details?: string;
  rejectionReason?: string;
  allowOpenSelection?: boolean; // If true, rejection moves order to OPEN
  responses?: string[]; // IDs of executors who applied
  voiceMessageUrl?: string; // Base64 encoded audio
  rating?: number;
  review?: string;
  locationFrom?: Location;
  locationTo?: Location;
  generalLocation?: Location;
}

export interface Review {
  id: string;
  authorId: string;
  authorName: string;
  rating: number;
  text: string;
  date: string;
}

export interface Service {
  id: string;
  userId: string;
  message: string;
  timestamp: string;
  read: boolean;
  source: 'WEB' | 'TELEGRAM';
}
