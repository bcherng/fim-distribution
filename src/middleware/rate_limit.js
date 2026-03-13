import rateLimit from 'express-rate-limit';

/**
 * Global rate limiter to prevent basic DDoS and overwhelming the API.
 * Limits all requests to 100 per 15 minute window.
 */
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

/**
 * Strict rate limiter for authentication and registration endpoints.
 * Limits attempts to 10 per 15 minute window.
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login or registration attempts, please try again later.' }
});
