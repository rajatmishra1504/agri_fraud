// routes/auth.js — updated with godown role + inspector godown linking
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database/db');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');

// GET list of godowns — used by register form dropdowns
router.get('/godowns', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, region FROM users WHERE role = 'godown' AND is_active = true ORDER BY name`
    );
    res.json({ godowns: result.rows });
  } catch (err) {
    console.error('Get godowns error:', err);
    res.status(500).json({ error: 'Failed to fetch godowns' });
  }
});

// Register
router.post('/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').trim().notEmpty(),
    body('role').isIn(['farmer', 'inspector', 'transporter', 'buyer', 'godown', 'fraud_analyst', 'admin'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        email, password, name, role, organization, phone,
        region, transporter_source_state, transporter_destination_states,
        godown_id  // NEW: for inspector role
      } = req.body;

      const normalizedRegionInput = String(region || organization || '').trim() || null;
      const normalizedTransporterSourceState = String(transporter_source_state || normalizedRegionInput || '').trim() || null;
      const normalizedTransporterDestinationStates = Array.isArray(transporter_destination_states)
        ? Array.from(new Set(transporter_destination_states.map((s) => String(s || '').trim()).filter(Boolean)))
        : [];

      if (['inspector', 'fraud_analyst'].includes(role) && !normalizedRegionInput) {
        return res.status(400).json({ error: 'state is required for inspector and fraud analyst roles' });
      }

      if (role === 'inspector' && !godown_id) {
        return res.status(400).json({ error: 'godown_id is required for inspector role' });
      }

      if (role === 'transporter') {
        if (!normalizedTransporterSourceState) {
          return res.status(400).json({ error: 'transporter_source_state is required for transporter role' });
        }
        if (normalizedTransporterDestinationStates.length === 0) {
          return res.status(400).json({ error: 'transporter_destination_states is required for transporter role' });
        }
      }

      const normalizedRegion = role === 'transporter' ? normalizedTransporterSourceState : normalizedRegionInput;
      const transporterDestinationStatesForInsert = role === 'transporter'
        ? `ARRAY[${normalizedTransporterDestinationStates.map((_, i) => `$${i + 10}`).join(',')}]::TEXT[]`
        : 'ARRAY[]::TEXT[]';

      // Validate godown exists
      let resolvedGodownId = null;
      let resolvedGodownName = null;
      if (role === 'inspector' && godown_id) {
        const godownRes = await pool.query(
          `SELECT id, name FROM users WHERE id = $1 AND role = 'godown' AND is_active = true`,
          [godown_id]
        );
        if (godownRes.rows.length === 0) {
          return res.status(400).json({ error: 'Selected godown does not exist or is inactive' });
        }
        resolvedGodownId = godownRes.rows[0].id;
        resolvedGodownName = godownRes.rows[0].name;
      }

      // Godown role should NOT have godown_id/godown_name set (they ARE the godown)
      if (role === 'godown') {
        resolvedGodownId = null;
        resolvedGodownName = null;
      }

      // Check email uniqueness
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const result = await pool.query(
        `INSERT INTO users (email, password_hash, role, name, phone, organization, region,
          transporter_source_state, transporter_destination_states, godown_id, godown_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${transporterDestinationStatesForInsert}, $9, $10)
         RETURNING id, email, role, name, phone, organization, region, godown_id, godown_name, created_at`,
        [
          email, passwordHash, role, name,
          phone || null, organization || null,
          normalizedRegion,
          normalizedTransporterSourceState,
          resolvedGodownId,
          resolvedGodownName,
          ...normalizedTransporterDestinationStates
        ]
      );

      const user = result.rows[0];
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      res.status(201).json({ message: 'User registered successfully', user, token });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query(
      `SELECT * FROM users WHERE email = $1 AND is_active = true`,
      [String(email).trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    const { password_hash, ...userWithoutPassword } = user;
    res.json({ message: 'Login successful', user: userWithoutPassword, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, role, name, phone, organization, region,
              transporter_source_state, transporter_destination_states,
              godown_id, godown_name, is_active, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

module.exports = router;
