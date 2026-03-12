const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');

const router = express.Router();

router.post('/signup', async (req, res) => {
  const { email, codename, password } = req.body;
  if (!email || !codename || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);

    db.run(
      `INSERT INTO users (email, codename, password_hash) VALUES (?, ?, ?)`,
      [email, codename, hash],
      function (err) {
        if (err) return res.status(400).json({ error: 'User already exists' });

        req.session.user = {
          id: this.lastID,
          email,
          codename
        };

        res.json({ ok: true, user: req.session.user });
      }
    );
  } catch {
    res.status(500).json({ error: 'Signup failed' });
  }
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      codename: user.codename
    };

    res.json({ ok: true, user: req.session.user });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;