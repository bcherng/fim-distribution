export const getConfig = (req, res) => {
    res.json({
        pusher: {
            key: process.env.PUSHER_KEY,
            cluster: process.env.PUSHER_CLUSTER
        }
    });
};
