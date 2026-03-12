const express = require('express');
const multer = require('multer');
const path = require('path');
const { requireAuth } = require('../auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '-');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

router.post('/image', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = `/uploads/${req.file.filename}`;
  const fileUrl = `http://127.0.0.1:3000${filePath}`;

  res.json({
    ok: true,
    filePath,
    fileUrl
  });
});

module.exports = router;