import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

/**
 * Возвращает единственный экземпляр Supabase-клиента (синглтон).
 * Если переменные окружения не настроены — возвращает null.
 */
export const getSupabase = (): SupabaseClient | null => {
    if (supabaseInstance) return supabaseInstance;

    const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
    const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

    if (!url || !key) return null;

    // Глобальный fetch с таймаутом, чтобы UI не зависал на долгих сетевых ожиданиях
    const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit) => {
        const timeoutMs = 20000;
        if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
            throw new Error('offline');
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const mergedInit: RequestInit = {
                ...(init || {}),
                signal: init?.signal ?? controller.signal
            };
            return await (globalThis.fetch as any)(input, mergedInit);
        } catch (e: any) {
            if (e?.name === 'AbortError') throw new Error('fetch-timeout');
            throw e;
        } finally {
            clearTimeout(timeoutId);
        }
    };

    try {
        const nav: any = typeof navigator !== 'undefined' ? navigator : null;
        if (nav && nav.locks && typeof nav.locks.request === 'function') {
            const fast = async (_name: any, _opts: any, callback: any) => callback();
            nav.locks.request = fast;
        }
    } catch {}

    supabaseInstance = createClient(url, key, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            multiTab: false as any
        } as any,
        global: {
            fetch: fetchWithTimeout as any
        } as any
    } as any);

    return supabaseInstance;
};
