import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '../types';
import { MOCK_USERS } from '../constants';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
  /* ... existing code ... */
  updateUser: (user: User) => void;
  loginWithGoogle: () => Promise<void>; // Added
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  /* ... existing state ... */
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /* ... existing updateUser ... */
  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('bez_barrierov_user', JSON.stringify(updatedUser));
  };

  /* ... existing useEffect ... */
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

  /* ... existing login ... */
  const login = async (email: string, password: string) => {
    const storedUsers = JSON.parse(localStorage.getItem('bez_barrierov_users') || '[]');
    const foundUser = storedUsers.find((u: User) => u.email.toLowerCase() === email.toLowerCase());
    
    if (foundUser) {
      setUser(foundUser);
      localStorage.setItem('bez_barrierov_user', JSON.stringify(foundUser));
    } else {
      throw new Error('Пользователь не найден');
    }
  };

  /* ... existing register ... */
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
      phone: '',
      rating: 5.0,
      description: ''
    };

    const updatedUsers = [...storedUsers, newUser];
    localStorage.setItem('bez_barrierov_users', JSON.stringify(updatedUsers));
    
    // Auto login
    setUser(newUser);
    localStorage.setItem('bez_barrierov_user', JSON.stringify(newUser));
  };

  const loginWithGoogle = async () => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const googleUserEmail = "google_user@gmail.com";
    const storedUsers = JSON.parse(localStorage.getItem('bez_barrierov_users') || '[]');
    let foundUser = storedUsers.find((u: User) => u.email.toLowerCase() === googleUserEmail);

    if (!foundUser) {
        // Create if doesn't exist
        foundUser = {
            id: "google-" + Date.now().toString(),
            name: "Google User",
            email: googleUserEmail,
            role: UserRole.CUSTOMER, // Default to customer
            phone: '',
            rating: 5.0,
            description: 'Logged in via Google'
        };
        const updatedUsers = [...storedUsers, foundUser];
        localStorage.setItem('bez_barrierov_users', JSON.stringify(updatedUsers));
    }

    setUser(foundUser);
    localStorage.setItem('bez_barrierov_user', JSON.stringify(foundUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('bez_barrierov_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, register, loginWithGoogle, logout, updateUser, isLoading }}>
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
