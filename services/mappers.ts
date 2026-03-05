import { User, Order } from '../types';

/**
 * Конвертирует строку из таблицы profiles в объект User.
 */
export const profileRowToUser = (row: any): User => {
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

/**
 * Конвертирует объект User в payload для update/insert в таблицу profiles.
 */
export const userToProfileUpdate = (u: User) => {
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

/**
 * Конвертирует строку из таблицы orders в объект Order.
 */
export const orderRowToOrder = (row: any): Order => {
    return {
        id: row.id,
        customerId: row.customer_id,
        executorId: row.executor_id ?? undefined,
        serviceType: row.service_type,
        date: row.date,
        time: row.time,
        status: row.status,
        totalPrice: row.total_price,
        details: row.details ?? undefined,
        rejectionReason: row.rejection_reason ?? undefined,
        allowOpenSelection: row.allow_open_selection ?? undefined,
        responses: Array.isArray(row.responses) ? row.responses.map((x: any) => String(x)) : [],
        voiceMessageUrl: row.voice_message_url ?? undefined,
        rating: row.rating ?? undefined,
        review: row.review ?? undefined,
        locationFrom: row.location_from ?? undefined,
        locationTo: row.location_to ?? undefined,
        generalLocation: row.general_location ?? undefined
    };
};

/**
 * Кэш для определения имени столбца ID в таблице profiles.
 */
let profileIdColumnCache: 'id' | 'user_id' | null = null;

/**
 * Определяет, как называется столбец-идентификатор в таблице profiles: 'id' или 'user_id'.
 * Результат кэшируется.
 */
export const resolveProfileIdColumn = async (supabase: any): Promise<'id' | 'user_id'> => {
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
