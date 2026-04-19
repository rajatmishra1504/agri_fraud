const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database/db');
const { body, validationResult } = require('express-validator');

// Register
router.post('/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').trim().notEmpty(),
    body('role').isIn(['inspector', 'transporter', 'buyer', 'fraud_analyst', 'admin'])
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
        ? Array.from(new Set([...normalizedTransporterDestinationStates, normalizedTransporterSourceState].filter(Boolean)))
        : [];

      // Check if user exists
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const result = await pool.query(
        `INSERT INTO users (
           email,
           password_hash,
           name,
           role,
           organization,
           phone,
           region,
           transporter_source_state,
           transporter_destination_states
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, email, name, role, organization, region, transporter_source_state, transporter_destination_states, created_at`,
        [
          email,
          passwordHash,
          name,
          role,
          organization,
          phone,
          normalizedRegion,
          role === 'transporter' ? normalizedTransporterSourceState : null,
          transporterDestinationStatesForInsert
        ]
      );

      const user = result.rows[0];

      // Generate token
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.status(201).json({
        message: 'User registered successfully',
        user,
        token
      });
    } catch (error) {
      console.error('Registration error:', error);
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

      // Get user
      const result = await pool.query(
        `SELECT id, email, password_hash, name, role, organization, region, transporter_source_state, transporter_destination_states, is_active
         FROM users WHERE email = $1`,
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];

      if (!user.is_active) {
        return res.status(401).json({ error: 'Account is inactive' });
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate token
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      // Remove password hash from response
      delete user.password_hash;

      res.json({
        message: 'Login successful',
        user,
        token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const result = await pool.query(
      `SELECT id, email, name, role, organization, region, transporter_source_state, transporter_destination_states, phone, created_at
       FROM users WHERE id = $1 AND is_active = true`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

module.exports = router;
