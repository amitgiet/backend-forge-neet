const multer = require('multer');
const path = require('path');

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, process.env.UPLOAD_PATH || './uploads');
    },
    filename: function (req, file, cb) {
        // username-timestamp-originalname
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const userId = req.user ? req.user._id : 'anonymous';
        cb(null, `${userId}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

// File filter - only allow PDFs and images
const fileFilter = (req, file, cb) => {
    const allowedTypes = /pdf|jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only PDF and image files are allowed'));
    }
};

// Configure multer
const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
    },
    fileFilter: fileFilter
});

// Single file upload middleware
exports.uploadSingle = (fieldName) => {
    return (req, res, next) => {
        const uploadMiddleware = upload.single(fieldName);

        uploadMiddleware(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        success: false,
                        error: 'File too large. Maximum size is 10MB'
                    });
                }
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            } else if (err) {
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }
            next();
        });
    };
};

// Multiple files upload middleware
exports.uploadMultiple = (fieldName, maxCount = 5) => {
    return (req, res, next) => {
        const uploadMiddleware = upload.array(fieldName, maxCount);

        uploadMiddleware(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        success: false,
                        error: 'File too large. Maximum size is 10MB'
                    });
                }
                if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                    return res.status(400).json({
                        success: false,
                        error: `Too many files. Maximum is ${maxCount}`
                    });
                }
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            } else if (err) {
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }
            next();
        });
    };
};
