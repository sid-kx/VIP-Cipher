const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.get('/:codename', requireAuth, (req, res) => {
  const requester = req.session.user;
  const targetCodename = req.params.codename;

  db.get(`SELECT * FROM users WHERE codename = ?`, [targetCodename], (err, targetUser) => {
    if (err || !targetUser) {
      return res.status(404).json({ error: 'Target not found' });
    }

    db.get(
      `SELECT * FROM threads
       WHERE (user_one_id = ? AND user_two_id = ?)
          OR (user_one_id = ? AND user_two_id = ?)`,
      [requester.id, targetUser.id, targetUser.id, requester.id],
      (threadErr, thread) => {
        if (threadErr || !thread) {
          return res.status(404).json({ error: 'No thread found' });
        }

        db.all(
          `SELECT messages.*, users.codename AS sender_codename
           FROM messages
           JOIN users ON messages.sender_id = users.id
           WHERE thread_id = ?
           ORDER BY created_at ASC`,
          [thread.id],
          (msgErr, messages) => {
            if (msgErr) {
              return res.status(500).json({ error: 'Export failed' });
            }

            const text = messages.map(msg =>
              `[${msg.created_at}] ${msg.sender_codename}: ${msg.body || '[image attached]'}`
            ).join('\n');

            res.setHeader('Content-Disposition', `attachment; filename="${targetCodename}-logs.txt"`);
            res.setHeader('Content-Type', 'text/plain');
            res.send(text);
          }
        );
      }
    );
  });
});

module.exports = router;