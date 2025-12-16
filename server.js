// ================================
// WASTE MANAGEMENT PLATFORM BACKEND
// ================================

require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// ================================
// CONFIG
// ================================
const PORT = process.env.PORT;
const JWT_SECRET = process.env.JWT_SECRET;

// ================================
// MIDDLEWARE
// ================================
app.use(cors({
  origin: '*'
}));
app.use(express.json());

// ================================
// DATABASE CONNECTION
// ================================
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// 🔎 HARD CHECK (NO SILENT FAILURES)
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL connected successfully');
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  }
})();

// ================================
// AUTH ROUTES
// ================================

// SIGNUP
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, confirmPassword, state, city } = req.body;

    if (!name || !email || !password || !confirmPassword || !state || !city) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const conn = await pool.getConnection();

    const [existing] = await conn.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      conn.release();
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    await conn.query(
      'INSERT INTO users (name, email, password, state, city) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, state, city]
    );

    conn.release();

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please login.'
    });

  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, message: 'Server error during signup' });
  }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const conn = await pool.getConnection();

    const [users] = await conn.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    conn.release();

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        state: user.state,
        city: user.city
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// ================================
// SERVER START
// ================================
app.listen(PORT, () => {
  console.log(`🌍 Server running on http://localhost:${PORT}`);
  console.log(`📦 Database: ${process.env.DB_NAME}`);
});