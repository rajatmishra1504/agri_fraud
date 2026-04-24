// routes/auth.js  — updated to include the 'farmer' role
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database/db');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');

// Register
router.post('/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').trim().notEmpty(),
    // ✅ Added 'farmer' to allowed roles
    body('role').isIn(['farmer', 'inspector', 'transporter', 'buyer', 'fraud_analyst', 'admin'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        email,
        password,
        name,
        role,
        organization,
        phone,
        region,
        transporter_source_state,
        transporter_destination_states
      } = req.body;

      const normalizedRegionInput = String(region || organization || '').trim() || null;
      const normalizedTransporterSourceState = String(transporter_source_state || normalizedRegionInput || '').trim() || null;
      const normalizedTransporterDestinationStates = Array.isArray(transporter_destination_states)
        ? Array.from(new Set(transporter_destination_states.map((state) => String(state || '').trim()).filter(Boolean)))
        : [];

      // Farmers don't require a region/state (optional)
      if (['inspector', 'fraud_analyst'].includes(role) && !normalizedRegionInput) {
        return res.status(400).json({ error: 'state is required for inspector and fraud analyst roles' });
      }

      if (role === 'transporter') {
        if (!normalizedTransporterSourceState) {
          return res.status(400).json({ error: 'transporter_source_state is required for transporter role' });
        }
        if (normalizedTransporterDestinationStates.length === 0) {
          return res.status(400).json({ error: 'transporter_destination_states is required for transporter role' });
        }
      }

      const normalizedRegion = role === 'transporter'
        ? normalizedTransporterSourceState
        : normalizedRegionInput;

      const transporterDestinationStatesForInsert = role === 'transporter'
        ? normalizedTransporterDestinationStates
        : [];

      // Check if email already exists
      const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const result = await pool.query(`
        INSERT INTO users (email, password_hash, name, role, phone, organization, region, transporter_source_state, transporter_destination_states)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, email, name, role, phone, organization, region, created_at
      `, [
        email,
        passwordHash,
        name,
        role,
        phone || null,
        organization || null,
        normalizedRegion,
        role === 'transporter' ? normalizedTransporterSourceState : null,
        transporterDestinationStatesForInsert
      ]);

      const user = result.rows[0];
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

      res.status(201).json({
        message: 'User registered successfully',
        user,
        token
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// Login
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];

      if (!user.is_active) {
        return res.status(403).json({ error: 'Account deactivated' });
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

      const { password_hash, ...userWithoutPassword } = user;

      res.json({
        message: 'Login successful',
        user: userWithoutPassword,
        token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, role, phone, organization, region, transporter_source_state, transporter_destination_states, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;
