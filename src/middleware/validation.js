import { z } from 'zod';

/**
 * Schema for client registration payloads.
 */
export const registrationSchema = z.object({
    client_id: z.string().optional(),
    clientId: z.string().optional(),
    hardware_info: z.union([z.string(), z.record(z.any())]).nullable().optional(),
    public_key: z.string().nullable().optional(),
    baseline_id: z.union([z.string(), z.number()]).nullable().optional(),
    platform: z.string().nullable().optional()
}).refine(data => data.client_id || data.clientId, {
    message: "Either client_id or clientId must be provided"
});

/**
 * Schema for client heartbeat payloads.
 */
export const heartbeatSchema = z.object({
    tracked_file_count: z.number().int().nonnegative(),
    current_root_hash: z.string().nullable(),
    boot_id: z.string().nullable()
});

/**
 * Schema for file integrity event payloads.
 */
export const eventSchema = z.object({
    id: z.union([z.number(), z.string()]),
    client_id: z.string(),
    event_type: z.string(),
    file_path: z.string(),
    old_hash: z.string().nullable().optional(),
    new_hash: z.string().nullable().optional(),
    event_hash: z.string().optional(),
    prev_event_hash: z.string().nullable().optional(),
    last_valid_hash: z.string().nullable().optional(),
    signature: z.string().optional(),
    timestamp: z.string().optional(),
    tracked_file_count: z.number().int().nonnegative().optional()
});

/**
 * Higher-order middleware to validate the request body against a Zod schema.
 * @param {z.ZodSchema} schema - The Zod schema to validate against.
 */
export const validateBody = (schema) => (req, res, next) => {
    try {
        schema.parse(req.body);
        next();
    } catch (error) {
        return res.status(400).json({
            error: "Invalid request payload",
            details: error.errors
        });
    }
};
