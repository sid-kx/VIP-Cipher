const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const MAX_MESSAGE_LENGTH = 1200;
const MAX_CODENAME_LENGTH = 32;

const normalizeCodename = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeMessage = (value) => String(value || '').trim();

function findOrCreateThread(senderId, receiverId, callback) {
  db.get(
    `SELECT * FROM threads
     WHERE (user_one_id = ? AND user_two_id = ?)
        OR (user_one_id = ? AND user_two_id = ?)`,
    [senderId, receiverId, receiverId, senderId],
    (err, thread) => {
      if (err) return callback(err);
      if (thread) return callback(null, thread);

      db.run(
        `INSERT INTO threads (user_one_id, user_two_id) VALUES (?, ?)`,
        [senderId, receiverId],
        function (insertErr) {
          if (insertErr) return callback(insertErr);
          callback(null, { id: this.lastID });
        }
      );
    }
  );
}

function getThread(senderId, receiverId, callback) {
  db.get(
    `SELECT * FROM threads
     WHERE (user_one_id = ? AND user_two_id = ?)
        OR (user_one_id = ? AND user_two_id = ?)`,
    [senderId, receiverId, receiverId, senderId],
    callback
  );
}

router.get('/thread/:codename', requireAuth, (req, res) => {
  const requester = req.session.user;
  const targetCodename = normalizeCodename(req.params.codename);

  if (!targetCodename) {
    return res.status(400).json({ error: 'Target codename is required' });
  }

  if (targetCodename.length > MAX_CODENAME_LENGTH) {
    return res.status(400).json({ error: 'Target codename is too long' });
  }

  db.get(`SELECT * FROM users WHERE codename = ?`, [targetCodename], (userErr, targetUser) => {
    if (userErr) {
      return res.status(500).json({ error: 'User lookup failed' });
    }

    if (!targetUser) {
      return res.status(404).json({ error: 'Target codename not found' });
    }

    getThread(requester.id, targetUser.id, (threadErr, thread) => {
      if (threadErr) {
        return res.status(500).json({ error: 'Thread lookup failed' });
      }

      if (!thread) {
        return res.json({ ok: true, messages: [] });
      }

      db.all(
        `SELECT messages.id, messages.body, messages.image_path, messages.created_at, users.codename AS senderCodename
         FROM messages
         JOIN users ON messages.sender_id = users.id
         WHERE messages.thread_id = ?
         ORDER BY messages.created_at ASC, messages.id ASC`,
        [thread.id],
        (messagesErr, messages) => {
          if (messagesErr) {
            return res.status(500).json({ error: 'Message history lookup failed' });
          }

          res.json({
            ok: true,
            threadId: thread.id,
            messages: messages.map((message) => ({
              id: message.id,
              body: message.body,
              imagePath: message.image_path,
              senderCodename: message.senderCodename,
              createdAt: message.created_at
            }))
          });
        }
      );
    });
  });
});

router.post('/send', requireAuth, (req, res) => {
  const sender = req.session.user;
  const targetCodename = normalizeCodename(req.body.targetCodename);
  const body = normalizeMessage(req.body.body);

  if (!targetCodename || !body) {
    return res.status(400).json({ error: 'Missing targetCodename or body' });
  }

  if (targetCodename.length > MAX_CODENAME_LENGTH) {
    return res.status(400).json({ error: 'Target codename is too long' });
  }

  if (body.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters` });
  }

  if (targetCodename === sender.codename) {
    return res.status(400).json({ error: 'You cannot send packets to your own codename' });
  }

  db.get(`SELECT * FROM users WHERE codename = ?`, [targetCodename], (err, receiver) => {
    if (err) {
      return res.status(500).json({ error: 'User lookup failed' });
    }

    if (!receiver) {
      return res.status(404).json({ error: 'Target codename not found' });
    }

    findOrCreateThread(sender.id, receiver.id, (threadErr, thread) => {
      if (threadErr) return res.status(500).json({ error: 'Thread creation failed' });

      db.run(
        `INSERT INTO messages (thread_id, sender_id, body) VALUES (?, ?, ?)`,
        [thread.id, sender.id, body],
        function (msgErr) {
          if (msgErr) return res.status(500).json({ error: 'Message send failed' });

          const payload = {
            id: this.lastID,
            threadId: thread.id,
            senderCodename: sender.codename,
            targetCodename,
            body,
            createdAt: new Date().toISOString()
          };

          const io = req.app.get('io');
          if (io) {
            io.to(sender.codename).emit('message_received', payload);
            io.to(receiver.codename).emit('message_received', payload);
          }

          res.json({ ok: true, message: payload });
        }
      );
    });
  });
});

module.exports = router;