import pusher from '../config/pusher.js';

/**
 * Broadcasts an update to connected clients via Pusher.
 * @param {string} clientId - The ID of the client that was updated.
 * @param {string} [type='client_updated'] - The type of update event.
 * @returns {Promise<void>}
 */
export async function broadcastUpdate(clientId, type = 'client_updated') {
    if (!pusher) return;

    const message = {
        type,
        clientId,
        timestamp: new Date().toISOString()
    };

    try {
        console.log(`[Pusher] Triggering update on channel 'fim-updates':`, message);
        await pusher.trigger('fim-updates', 'client_updated', message);
    } catch (error) {
        console.error(`[Pusher] Error triggering update:`, error.message);
    }
}
