
import React from 'react';
import { User, UserRole, ServiceType, Order, OrderStatus } from './types';

export const SERVICE_TYPES: ServiceType[] = [
  { 
    id: '1', 
    name: 'Прогулка и сопровождение', 
    pricePerHour: 500,
    headerImage: 'https://static.vecteezy.com/system/resources/previews/008/296/398/non_2x/outdoor-activity-people-walking-in-the-city-park-mom-with-a-baby-carriage-woman-in-wheelchair-with-an-accompanying-person-young-man-urban-recreation-concept-diversity-concept-vector.jpg',
    headerColor: '#FFFFFF'
  },
  { 
    id: '2', 
    name: 'Поход в магазин/аптеку', 
    pricePerHour: 400,
    headerImage: 'https://cdn.vectorstock.com/i/500p/50/68/smiling-male-pharmacist-consulting-female-customer-vector-32265068.jpg',
    headerColor: '#FFFFFF'
  },
  { 
    id: '3', 
    name: 'Транспортировка на авто', 
    pricePerHour: 1000,
    headerImage: 'https://img.freepik.com/premium-vector/woman-with-disability-getting-into-her-car-flat-design-illustration_218660-1010.jpg?semt=ais_hybrid&w=740',
    headerColor: '#FFFFFF'
  },
  { 
    id: '4', 
    name: 'Помощь по дому', 
    pricePerHour: 600,
    headerImage: 'https://static.vecteezy.com/system/resources/thumbnails/009/361/497/small_2x/flat-cartoon-character-surfing-internet-illustration-concept-vector.jpg',
    headerColor: '#FFFFFF'
  },
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
    id: 'admin1',
    role: UserRole.ADMIN,
    name: 'Администратор',
    email: 'admin@bezbarrerov.ru',
    phone: '+7 800 555-35-35'
  }
];

export const MOCK_ORDERS: Order[] = [];

export const LEGAL_DISCLAIMER = "«Платформа «Без Барьеров» предоставляет сервис для поиска и заказа услуг сопровождения и помощи в передвижении. Все услуги оказываются исполнителями напрямую. Платформа не предоставляет и не продаёт государственные льготы. Пользователи обязаны соблюдать действующее законодательство РФ.»";
