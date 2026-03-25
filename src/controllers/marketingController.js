const AppDownloadClick = require('../models/AppDownloadClick');

/**
 * POST /api/v1/marketing/track-download-click
 * Public endpoint – no auth required.
 * Records a click on the app download button from the marketing website.
 */
exports.trackDownloadClick = async (req, res) => {
    try {
        const { buttonLabel, referrer } = req.body;

        const ip =
            req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.socket?.remoteAddress ||
            null;

        await AppDownloadClick.create({
            buttonLabel: buttonLabel || 'unknown',
            userAgent: req.headers['user-agent'] || null,
            ipAddress: ip,
            referrer: referrer || req.headers['referer'] || null
        });

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[trackDownloadClick] error:', err.message);
        return res.status(500).json({ success: false });
    }
};

/**
 * GET /api/v1/marketing/download-stats
 * Protected (Admin only) – returns total clicks grouped by button label.
 */
exports.getDownloadStats = async (req, res) => {
    try {
        const total = await AppDownloadClick.countDocuments();

        const byButton = await AppDownloadClick.aggregate([
            { $group: { _id: '$buttonLabel', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayCount = await AppDownloadClick.countDocuments({ createdAt: { $gte: today } });

        return res.status(200).json({
            success: true,
            data: {
                total,
                today: todayCount,
                byButton
            }
        });
    } catch (err) {
        console.error('[getDownloadStats] error:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};
