import ExpressBrute from 'express-brute';

/**
 * Brute-force protection store. 
 * Defaults to MemoryStore; should be migrated to RedisStore for distributed production environments.
 */
const store = new ExpressBrute.MemoryStore();

/**
 * Brute-force protection middleware for sensitive endpoints like login.
 * Implements progressive delays and lockouts after multiple failed attempts.
 */
export const bruteForce = new ExpressBrute(store, {
    freeRetries: 5,
    minWait: 5 * 1000,
    maxWait: 60 * 60 * 1000,
    failCallback: (req, res, next, nextValidRequestDate) => {
        res.status(429).json({
            error: "Too many failed attempts. Please try again later.",
            nextValidRequestDate: nextValidRequestDate
        });
    }
});
