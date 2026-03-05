-- 1. Таблица сообщений чата
CREATE TABLE IF NOT EXISTS public.order_messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    sender_id text NOT NULL, -- auth.users.id
    receiver_id text NOT NULL, -- auth.users.id
    text text NOT NULL,
    is_approved boolean DEFAULT false, -- пока админ не нажмет Одобрить
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Включаем RLS
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

-- 3. Политики безопасности для order_messages
-- Заказчик и Помощник могут читать только ОДОБРЕННЫЕ сообщения, относящиеся к их заказам, 
-- либо СВОИ собственные сообщения (даже если они еще не одобрены, чтобы видеть историю отправленного).
CREATE POLICY "Users can view relevant approved or own messages" 
ON public.order_messages FOR SELECT 
USING (
  sender_id = auth.uid()::text 
  OR 
  (receiver_id = auth.uid()::text AND is_approved = true)
);

-- Отправлять сообщения могут авторизованные пользователи
CREATE POLICY "Users can insert own messages" 
ON public.order_messages FOR INSERT 
WITH CHECK (sender_id = auth.uid()::text);

-- 4. Добавляем колонку telegram_chat_id в таблицу profiles (для бота)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='telegram_chat_id') THEN 
    ALTER TABLE public.profiles ADD COLUMN telegram_chat_id text;
  END IF; 
END $$;
