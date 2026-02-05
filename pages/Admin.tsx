
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const data = [
  { name: 'Пн', orders: 12, revenue: 4500 },
  { name: 'Вт', orders: 19, revenue: 8000 },
  { name: 'Ср', orders: 15, revenue: 6200 },
  { name: 'Чт', orders: 22, revenue: 11000 },
  { name: 'Пт', orders: 30, revenue: 15400 },
  { name: 'Сб', orders: 25, revenue: 12100 },
  { name: 'Вс', orders: 18, revenue: 7800 },
];

const Admin: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Панель Администратора</h1>
          <p className="text-gray-500">Общая статистика и управление сервисом</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50">Выгрузить отчет</button>
          <button className="px-4 py-2 bg-careem-primary text-white rounded-xl text-sm font-medium hover:bg-careem-dark">Настройки</button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-10 h-10 bg-green-50 text-careem-primary rounded-lg flex items-center justify-center mb-4">
            <i className="fas fa-users"></i>
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-1">Всего пользователей</p>
          <p className="text-2xl font-black text-gray-900">1,248</p>
          <p className="text-xs text-green-500 mt-1 font-bold"><i className="fas fa-arrow-up mr-1"></i> +12%</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-10 h-10 bg-green-50 text-green-600 rounded-lg flex items-center justify-center mb-4">
            <i className="fas fa-file-invoice-dollar"></i>
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-1">Выручка (7 дн)</p>
          <p className="text-2xl font-black text-gray-900">65,000 ₽</p>
          <p className="text-xs text-green-500 mt-1 font-bold"><i className="fas fa-arrow-up mr-1"></i> +8%</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-10 h-10 bg-green-50 text-careem-primary rounded-lg flex items-center justify-center mb-4">
            <i className="fas fa-check-double"></i>
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-1">Выполнено заказов</p>
          <p className="text-2xl font-black text-gray-900">151</p>
          <p className="text-xs text-gray-400 mt-1">за текущую неделю</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center mb-4">
            <i className="fas fa-gem"></i>
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-1">PRO-подписки</p>
          <p className="text-2xl font-black text-gray-900">42</p>
          <p className="text-xs text-indigo-500 mt-1 font-bold">Активные сейчас</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-6">Динамика заказов</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                <Bar dataKey="orders" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-6">Финансовая активность</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                <Line type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={3} dot={{r: 4, fill: '#4f46e5'}} activeDot={{r: 6}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-gray-900">Последние регистрации</h3>
          <button className="text-careem-primary text-sm font-bold hover:underline">Смотреть всех</button>
        </div>
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
            <tr>
              <th className="px-6 py-4">Пользователь</th>
              <th className="px-6 py-4">Роль</th>
              <th className="px-6 py-4">Регистрация</th>
              <th className="px-6 py-4">Статус</th>
              <th className="px-6 py-4 text-right">Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {[1, 2, 3, 4, 5].map(i => (
              <tr key={i} className="hover:bg-gray-50 transition">
                <td className="px-6 py-4 flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-xs font-bold text-careem-primary">У{i}</div>
                  <div>
                    <p className="font-bold text-gray-900">Пользователь #{i}</p>
                    <p className="text-xs text-gray-500">user{i}@test.com</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${i % 2 === 0 ? 'bg-green-50 text-careem-primary' : 'bg-green-50 text-green-600'}`}>
                    {i % 2 === 0 ? 'ИСПОЛНИТЕЛЬ' : 'ЗАКАЗЧИК'}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-500">22.11.2023</td>
                <td className="px-6 py-4">
                   <span className="flex items-center gap-1 text-green-500"><span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span> Активен</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="text-gray-400 hover:text-gray-600"><i className="fas fa-ellipsis-h"></i></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Admin;
