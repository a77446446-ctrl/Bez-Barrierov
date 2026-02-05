
import React from 'react';
import { User, UserRole, ServiceType, Order, OrderStatus } from './types';

export const SERVICE_TYPES: ServiceType[] = [
  { id: '1', name: 'Прогулка и сопровождение', pricePerHour: 500 },
  { id: '2', name: 'Поход в магазин/аптеку', pricePerHour: 400 },
  { id: '3', name: 'Транспортировка на авто', pricePerHour: 1000 },
  { id: '4', name: 'Помощь по дому', pricePerHour: 600 },
];

export const MOCK_USERS: User[] = [
  {
    id: 'u1',
    role: UserRole.CUSTOMER,
    name: 'Иван Сергеевич',
    email: 'ivan@example.com',
    phone: '+7 900 123-45-67',
    telegramId: '@ivan_c',
    avatar: 'https://picsum.photos/seed/ivan/200'
  },
  {
    id: 'u2',
    role: UserRole.EXECUTOR,
    name: 'Алексей Петров',
    email: 'alex@example.com',
    phone: '+7 900 765-43-21',
    telegramId: '@alex_helper',
    avatar: 'https://picsum.photos/seed/alex/200',
    isSubscribed: true,
    rating: 4.9,
    location: 'Москва, ЦАО',
    description: 'Опытный волонтер, есть свой автомобиль с пандусом. Всегда пунктуален.'
  },
  {
    id: 'u3',
    role: UserRole.EXECUTOR,
    name: 'Мария Сидорова',
    email: 'maria@example.com',
    phone: '+7 911 222-33-44',
    avatar: 'https://picsum.photos/seed/maria/200',
    isSubscribed: false,
    rating: 4.7,
    location: 'Москва, ЗАО',
    description: 'Помогаю с покупками и прогулками. Знаю лучшие безбарьерные маршруты.'
  },
  {
    id: 'admin1',
    role: UserRole.ADMIN,
    name: 'Администратор',
    email: 'admin@bezbarrerov.ru',
    phone: '+7 800 555-35-35'
  }
];

export const MOCK_ORDERS: Order[] = [
  {
    id: 'o1',
    customerId: 'u1',
    executorId: 'u2',
    serviceType: 'Транспортировка на авто',
    date: '2023-11-20',
    time: '14:00',
    status: OrderStatus.CONFIRMED,
    totalPrice: 2000
  },
  {
    id: 'o2',
    customerId: 'u1',
    executorId: 'u3',
    serviceType: 'Поход в магазин/аптеку',
    date: '2023-11-18',
    time: '10:00',
    status: OrderStatus.COMPLETED,
    totalPrice: 800
  }
];

export const LEGAL_DISCLAIMER = "«Платформа «Без Барьеров» предоставляет сервис для поиска и заказа услуг сопровождения и помощи в передвижении. Все услуги оказываются исполнителями напрямую. Платформа не предоставляет и не продаёт государственные льготы. Пользователи обязаны соблюдать действующее законодательство РФ.»";
