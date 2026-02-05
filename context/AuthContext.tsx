import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '../types';
import { MOCK_USERS } from '../constants';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('bez_barrierov_user', JSON.stringify(updatedUser));
  };

  useEffect(() => {
    // Initialize users in localStorage if empty
    const storedUsers = localStorage.getItem('bez_barrierov_users');
    if (!storedUsers) {
      localStorage.setItem('bez_barrierov_users', JSON.stringify(MOCK_USERS));
    }

    // Check active session
    const storedUser = localStorage.getItem('bez_barrierov_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse stored user", e);
        localStorage.removeItem('bez_barrierov_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const storedUsers = JSON.parse(localStorage.getItem('bez_barrierov_users') || '[]');
    // For mock users, we don't really check password in this demo, but for real auth we would.
    // Let's assume password check is passed for now or match simple mock logic.
    // To make it "full", let's find by email.
    const foundUser = storedUsers.find((u: User) => u.email.toLowerCase() === email.toLowerCase());
    
    if (foundUser) {
      setUser(foundUser);
      localStorage.setItem('bez_barrierov_user', JSON.stringify(foundUser));
    } else {
      throw new Error('Пользователь не найден');
    }
  };

  const register = async (name: string, email: string, password: string, role: UserRole) => {
    const storedUsers = JSON.parse(localStorage.getItem('bez_barrierov_users') || '[]');
    
    if (storedUsers.find((u: User) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('Пользователь с таким email уже существует');
    }

    const newUser: User = {
      id: Date.now().toString(),
      name,
      email,
      role,
      phone: '', // Optional for now
      rating: 5.0,
      description: ''
    };

    const updatedUsers = [...storedUsers, newUser];
    localStorage.setItem('bez_barrierov_users', JSON.stringify(updatedUsers));
    
    // Auto login
    setUser(newUser);
    localStorage.setItem('bez_barrierov_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('bez_barrierov_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
