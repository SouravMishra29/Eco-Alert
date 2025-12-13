// ============================================
// WASTE MANAGEMENT AWARENESS PLATFORM
// Backend Server with Express & MySQL
// ============================================

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('public'));

// Image upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// ============================================
// DATABASE CONNECTION POOL
// ============================================
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'waste_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ============================================
// GEMINI AI INITIALIZATION
// ============================================
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// SIGNUP
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, confirmPassword, state, city } = req.body;

    // Validation
    if (!name || !email || !password || !confirmPassword || !state || !city) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const connection = await pool.getConnection();

    try {
      // Check if user exists
      const [existingUser] = await connection.query(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );

      if (existingUser.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email already registered'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert user
      await connection.query(
        'INSERT INTO users (name, email, password, state, city, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [name, email, hashedPassword, state, city]
      );

      res.status(201).json({
        success: true,
        message: 'Registration successful. Please login.'
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during signup'
    });
  }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const connection = await pool.getConnection();

    try {
      const [users] = await connection.query(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const user = users[0];

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          state: user.state,
          city: user.city
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          state: user.state,
          city: user.city
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// ============================================
// GEMINI AI NEWS ROUTES
// ============================================

// GET NEWS HEADLINES FOR CITY
app.get('/api/news/:city', async (req, res) => {
  try {
    const { city } = req.params;

    // Check cache first
    const connection = await pool.getConnection();
    try {
      const [cachedNews] = await connection.query(
        'SELECT content, created_at FROM news_cache WHERE city = ? AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_at DESC LIMIT 5',
        [city]
      );

      if (cachedNews.length > 0) {
        return res.json({
          success: true,
          source: 'cache',
          news: cachedNews.map(item => ({
            content: item.content,
            timestamp: item.created_at
          }))
        });
      }
    } finally {
      connection.release();
    }

    // Fetch from Gemini AI
    const prompt = `Provide 5 important news headlines about waste management, pollution, and environmental issues specifically related to ${city}, India. Format as JSON array with fields: title, description, severity (high/medium/low). Focus on actionable information about non-biodegradable waste, pollution control initiatives, and community efforts. Keep descriptions under 100 words each.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON from response
    let newsData = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        newsData = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Return text as fallback
      newsData = [{
        title: 'Waste Management Update',
        description: responseText,
        severity: 'medium'
      }];
    }

    // Cache the news
    const connection2 = await pool.getConnection();
    try {
      for (const news of newsData) {
        await connection2.query(
          'INSERT INTO news_cache (city, content, created_at) VALUES (?, ?, NOW())',
          [city, JSON.stringify(news)]
        );
      }
    } finally {
      connection2.release();
    }

    res.json({
      success: true,
      source: 'gemini_ai',
      news: newsData
    });
  } catch (error) {
    console.error('News fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching news'
    });
  }
});

// ============================================
// POLLUTION INFORMATION ROUTES
// ============================================

// GET POLLUTION INFO FOR USER'S CITY
app.get('/api/pollution/:city', async (req, res) => {
  try {
    const { city } = req.params;

    const prompt = `Provide detailed information about pollution and waste management issues in ${city}, India. Include:
    1. Current pollution types (air, water, soil, plastic waste)
    2. Major pollution sources
    3. Health impacts
    4. Government initiatives
    5. How citizens can help
    6. Local waste management facilities
    Format as JSON with these keys: pollutionTypes, sources, healthImpacts, initiatives, citizenActions, facilities`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    let pollutionData = {};
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        pollutionData = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      pollutionData = {
        info: responseText,
        city: city
      };
    }

    res.json({
      success: true,
      city: city,
      data: pollutionData
    });
  } catch (error) {
    console.error('Pollution info error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pollution information'
    });
  }
});

// ============================================
// USER REVIEWS & COMPLAINTS ROUTES
// ============================================

// POST REVIEW/COMPLAINT
app.post('/api/reviews', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { title, description, wasteType, severity } = req.body;
    const userId = req.user.id;
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    if (!title || !description || !wasteType) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, and waste type are required'
      });
    }

    const connection = await pool.getConnection();
    try {
      const [result] = await connection.query(
        'INSERT INTO reviews (user_id, title, description, waste_type, severity, image_path, state, city, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
        [userId, title, description, wasteType, severity || 'medium', imagePath, req.user.state, req.user.city]
      );

      res.status(201).json({
        success: true,
        message: 'Review posted successfully',
        reviewId: result.insertId
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Review post error:', error);
    res.status(500).json({
      success: false,
      message: 'Error posting review'
    });
  }
});

// GET REVIEWS FOR CITY
app.get('/api/reviews/:city', async (req, res) => {
  try {
    const { city } = req.params;
    const limit = req.query.limit || 20;
    const offset = req.query.offset || 0;

    const connection = await pool.getConnection();
    try {
      const [reviews] = await connection.query(
        `SELECT r.id, r.title, r.description, r.waste_type, r.severity, r.image_path, 
                r.created_at, u.name, u.id as user_id, 
                (SELECT COUNT(*) FROM review_likes WHERE review_id = r.id) as likes
         FROM reviews r
         JOIN users u ON r.user_id = u.id
         WHERE r.city = ?
         ORDER BY r.created_at DESC
         LIMIT ? OFFSET ?`,
        [city, parseInt(limit), parseInt(offset)]
      );

      const [countResult] = await connection.query(
        'SELECT COUNT(*) as total FROM reviews WHERE city = ?',
        [city]
      );

      res.json({
        success: true,
        reviews: reviews,
        total: countResult[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reviews'
    });
  }
});

// LIKE/UNLIKE REVIEW
app.post('/api/reviews/:reviewId/like', authenticateToken, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;

    const connection = await pool.getConnection();
    try {
      const [existingLike] = await connection.query(
        'SELECT id FROM review_likes WHERE review_id = ? AND user_id = ?',
        [reviewId, userId]
      );

      if (existingLike.length > 0) {
        // Unlike
        await connection.query(
          'DELETE FROM review_likes WHERE review_id = ? AND user_id = ?',
          [reviewId, userId]
        );
        return res.json({ success: true, action: 'unliked' });
      } else {
        // Like
        await connection.query(
          'INSERT INTO review_likes (review_id, user_id) VALUES (?, ?)',
          [reviewId, userId]
        );
        return res.json({ success: true, action: 'liked' });
      }
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating like'
    });
  }
});

// ============================================
// COMMUNITY STATS ROUTES
// ============================================

// GET STATISTICS
app.get('/api/stats/:city', async (req, res) => {
  try {
    const { city } = req.params;

    const connection = await pool.getConnection();
    try {
      const [stats] = await connection.query(`
        SELECT 
          (SELECT COUNT(*) FROM reviews WHERE city = ?) as total_reports,
          (SELECT COUNT(*) FROM users WHERE city = ?) as active_users,
          (SELECT COUNT(*) FROM reviews WHERE city = ? AND waste_type = 'plastic') as plastic_reports,
          (SELECT COUNT(*) FROM reviews WHERE city = ? AND waste_type = 'electronic') as electronic_reports,
          (SELECT COUNT(*) FROM reviews WHERE city = ? AND waste_type = 'industrial') as industrial_reports,
          (SELECT COUNT(*) FROM reviews WHERE city = ? AND severity = 'high') as high_severity_reports
      `, [city, city, city, city, city, city]);

      res.json({
        success: true,
        stats: stats[0]
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics'
    });
  }
});

// ============================================
// LEADERBOARD ROUTES
// ============================================

// GET TOP CONTRIBUTORS
app.get('/api/leaderboard/:city', async (req, res) => {
  try {
    const { city } = req.params;

    const connection = await pool.getConnection();
    try {
      const [leaderboard] = await connection.query(`
        SELECT 
          u.name,
          COUNT(r.id) as contribution_count,
          (SELECT COUNT(*) FROM review_likes rl JOIN reviews r2 ON rl.review_id = r2.id WHERE r2.user_id = u.id) as total_likes
        FROM users u
        LEFT JOIN reviews r ON u.id = r.user_id AND r.city = ?
        WHERE u.city = ?
        GROUP BY u.id
        ORDER BY contribution_count DESC, total_likes DESC
        LIMIT 10
      `, [city, city]);

      res.json({
        success: true,
        leaderboard: leaderboard
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching leaderboard'
    });
  }
});

// ============================================
// ERROR HANDLING
// ============================================
app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: 'File upload error' });
  }
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`🌍 Waste Management Server running on http://localhost:${PORT}`);
  console.log(`Database: ${process.env.DB_NAME || 'waste_management'}`);
  console.log(`Gemini API: ${GEMINI_API_KEY ? 'Connected' : 'Not configured'}`);
});

module.exports = app;
