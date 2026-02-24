import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';
import { User, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  logout: () => void;
  /* ... existing code ... */
  updateUser: (user: User) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithTelegram: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
let profileIdColumnCache: 'id' | 'user_id' | null = null;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  /* ... existing state ... */
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getSupabase = () => {
    const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
    const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) return null;
    return createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        lock: async (_name, _acquireTimeout, fn) => {
          return await fn();
        }
      }
    });
  };

  const resolveProfileIdColumn = async (supabase: any): Promise<'id' | 'user_id'> => {
    if (profileIdColumnCache) return profileIdColumnCache;
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (
      error &&
      (/column profiles\.id does not exist/i.test(error.message) ||
        /Could not find the 'id' column of 'profiles' in the schema cache/i.test(error.message))
    ) {
      profileIdColumnCache = 'user_id';
      return profileIdColumnCache;
    }
    profileIdColumnCache = 'id';
    return profileIdColumnCache;
  };

  const profileRowToUser = (row: any): User => {
    return {
      id: row.id ?? row.user_id ?? row.userId,
      role: row.role,
      name: row.name || '',
      email: row.email || '',
      phone: row.phone || '',
      telegramId: row.telegram_id ?? row.telegramId,
      avatar: row.avatar ?? row.avatar_url,
      isSubscribed: row.is_subscribed ?? row.isSubscribed,
      rating: row.rating ?? undefined,
      reviewsCount: row.reviews_count ?? row.reviewsCount,
      reviews: row.reviews ?? undefined,
      location: row.location ?? undefined,
      locationCoordinates: row.location_coordinates ?? row.locationCoordinates,
      coverageRadius: row.coverage_radius ?? row.coverageRadius,
      description: row.description ?? undefined,
      profileVerificationStatus: row.profile_verification_status ?? row.profileVerificationStatus,
      vehiclePhoto: row.vehicle_photo ?? row.vehiclePhoto,
      customServices: row.custom_services ?? row.customServices,
      subscriptionStatus: row.subscription_status ?? row.subscriptionStatus,
      subscriptionStartDate: row.subscription_start_date ?? row.subscriptionStartDate,
      subscriptionEndDate: row.subscription_end_date ?? row.subscriptionEndDate,
      subscribedToCustomerId: row.subscribed_to_customer_id ?? row.subscribedToCustomerId,
      subscriptionRequestToCustomerId: row.subscription_request_to_customer_id ?? row.subscriptionRequestToCustomerId,
      subscribedExecutorId: row.subscribed_executor_id ?? row.subscribedExecutorId,
      notifications: row.notifications ?? undefined
    };
  };

  const userToProfileUpdate = (u: User) => {
    return {
      role: u.role,
      name: u.name,
      email: u.email,
      phone: u.phone,
      telegram_id: u.telegramId ?? null,
      avatar: u.avatar ?? null,
      is_subscribed: u.isSubscribed ?? null,
      rating: u.rating ?? null,
      reviews_count: u.reviewsCount ?? null,
      reviews: u.reviews ?? null,
      location: u.location ?? null,
      location_coordinates: u.locationCoordinates ?? null,
      coverage_radius: u.coverageRadius ?? null,
      description: u.description ?? null,
      profile_verification_status: u.profileVerificationStatus ?? null,
      vehicle_photo: u.vehiclePhoto ?? null,
      custom_services: u.customServices ?? null,
      subscription_status: u.subscriptionStatus ?? null,
      subscription_start_date: u.subscriptionStartDate ?? null,
      subscription_end_date: u.subscriptionEndDate ?? null,
      subscribed_to_customer_id: u.subscribedToCustomerId ?? null,
      subscription_request_to_customer_id: u.subscriptionRequestToCustomerId ?? null,
      subscribed_executor_id: u.subscribedExecutorId ?? null,
      notifications: u.notifications ?? null
    };
  };

  const fetchProfileById = async (supabase: any, id: string) => {
    const col = await resolveProfileIdColumn(supabase);
    const { data, error } = await supabase.from('profiles').select('*').eq(col, id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return profileRowToUser(data);
  };

  const fetchProfileByEmail = async (supabase: any, email: string) => {
    const { data, error } = await supabase.from('profiles').select('*').ilike('email', email).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return profileRowToUser(data);
  };

  const updateUser = async (updatedUser: User) => {
    setUser(updatedUser);
    const supabase = getSupabase();
    if (!supabase) return;
    const col = await resolveProfileIdColumn(supabase);
    await supabase.from('profiles').update(userToProfileUpdate(updatedUser)).eq(col, updatedUser.id);
  };

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let isActive = true;

    const syncUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!isActive) return;

      if (error) {
        const message = error.message || '';
        const isDeleted =
          /user.*not.*found/i.test(message) || /session.*not.*found/i.test(message) || /token.*invalid/i.test(message);

        if (isDeleted) {
          setUser(null);
          setIsLoading(false);
          await supabase.auth.signOut();
          if (typeof window !== 'undefined') {
            window.location.href = '/auth?mode=register&deleted=1';
          }
          return;
        }

        setUser(null);
        setIsLoading(false);
        return;
      }

      const authUser = data?.user;
      if (!authUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const profile = await fetchProfileById(supabase, authUser.id);
      if (!isActive) return;
      if (!profile) {
        setUser(null);
        setIsLoading(false);
        return;
      }
      setUser(profile);
      setIsLoading(false);
    };

    void syncUser();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void syncUser();
    });

    return () => {
      isActive = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase не настроен');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (/email not confirmed/i.test(error.message)) {
        throw new Error('Подтвердите email в письме, затем войдите снова.');
      }
      throw error;
    }

    const authUser = data?.user;
    const id = authUser?.id;
    if (!id) {
      await supabase.auth.signOut();
      throw new Error('Не удалось получить пользователя');
    }

    const profile = await fetchProfileById(supabase, id);
    if (!profile) {
      await supabase.auth.signOut();
      throw new Error('Профиль не создан. Перейдите в регистрацию и заполните данные.');
    }
    setUser(profile);
  };

  const register = async (name: string, email: string, password: string, role: UserRole) => {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase не настроен');

    const createOrUpdateProfile = async (userId: string) => {
      const col = await resolveProfileIdColumn(supabase);
      const profilePayload = {
        [col]: userId,
        role,
        name,
        email,
        phone: '',
        rating: 5.0,
        profile_verification_status: 'none'
      };

      const { data: updatedRows, error: updateError } = await supabase
        .from('profiles')
        .update(profilePayload)
        .eq(col, userId)
        .select('*');
      if (updateError) throw updateError;
      if (Array.isArray(updatedRows) && updatedRows.length > 0) {
        return profileRowToUser(updatedRows[0]);
      }

      const { data: insertedRows, error: insertError } = await supabase.from('profiles').insert(profilePayload).select('*');
      if (insertError) throw insertError;
      if (!Array.isArray(insertedRows) || insertedRows.length === 0) throw new Error('Не удалось создать профиль');
      return profileRowToUser(insertedRows[0]);
    };

    const existing = await fetchProfileByEmail(supabase, email);
    if (existing) {
      const roleLabel =
        existing.role === UserRole.EXECUTOR ? 'помощник' : existing.role === UserRole.CUSTOMER ? 'заказчик' : 'пользователь';
      throw new Error(`Этот email уже зарегистрирован как ${roleLabel}. Войдите в аккаунт.`);
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      if (/user already registered/i.test(error.message)) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          if (/invalid login credentials/i.test(signInError.message)) {
            throw new Error('Этот email уже зарегистрирован. Неверный пароль. Войдите или восстановите пароль.');
          }
          throw signInError;
        }
        const authUser = signInData?.user;
        if (!authUser?.id) throw new Error('Не удалось получить пользователя');
        const profile = await createOrUpdateProfile(authUser.id);
        setUser(profile);
        return;
      }
      throw error;
    }

    const authUser = data?.user;
    if (!authUser?.id) throw new Error('Не удалось завершить регистрацию');

    const profile = await createOrUpdateProfile(authUser.id);
    setUser(profile);

  };
  const resetPassword = async (email: string) => {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase не настроен');
    const redirectTo = `${window.location.origin}/auth?mode=reset`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase не настроен');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };


  const loginWithGoogle = async () => {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase не настроен');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) throw error;
  };

  const loginWithTelegram = async () => {
    throw new Error('Вход через Telegram не настроен');
  };

  const logout = () => {
    setUser(null);
    const supabase = getSupabase();
    if (supabase) {
      void supabase.auth.signOut();
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, register, resetPassword, updatePassword, loginWithGoogle, loginWithTelegram, logout, updateUser, isLoading }}>
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
