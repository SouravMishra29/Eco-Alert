-- ============================================
-- WASTE MANAGEMENT AWARENESS PLATFORM
-- MySQL Database Schema
-- ============================================

-- Create database
CREATE DATABASE IF NOT EXISTS waste_management;
USE waste_management;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  state VARCHAR(50) NOT NULL,
  city VARCHAR(50) NOT NULL,
  profile_picture VARCHAR(255),
  bio TEXT,
  contributions INT DEFAULT 0,
  points INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_city (city),
  INDEX idx_state (state),
  INDEX idx_email (email)
);

-- ============================================
-- REVIEWS/COMPLAINTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  waste_type ENUM('plastic', 'electronic', 'industrial', 'organic', 'hazardous', 'medical', 'other') NOT NULL,
  severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
  image_path VARCHAR(255),
  state VARCHAR(50) NOT NULL,
  city VARCHAR(50) NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  status ENUM('open', 'in_progress', 'resolved', 'rejected') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_city (city),
  INDEX idx_user_id (user_id),
  INDEX idx_severity (severity),
  INDEX idx_created_at (created_at)
);

-- ============================================
-- REVIEW LIKES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS review_likes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  review_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_like (review_id, user_id)
);

-- ============================================
-- REVIEW COMMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS review_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  review_id INT NOT NULL,
  user_id INT NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_review_id (review_id)
);

-- ============================================
-- NEWS CACHE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS news_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  city VARCHAR(50) NOT NULL,
  content LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_city (city),
  INDEX idx_created_at (created_at)
);

-- ============================================
-- POLLUTION DATA TABLE (for trends)
-- ============================================
CREATE TABLE IF NOT EXISTS pollution_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  city VARCHAR(50) NOT NULL,
  pollution_type ENUM('air', 'water', 'soil', 'plastic') NOT NULL,
  severity_index INT,
  recorded_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data_source VARCHAR(50),
  INDEX idx_city (recorded_date),
  INDEX idx_recorded_date (recorded_date)
);

-- ============================================
-- BADGES/ACHIEVEMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_badges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  badge_name VARCHAR(100) NOT NULL,
  description TEXT,
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_badge (user_id, badge_name)
);

-- ============================================
-- EVENTS TABLE (Community events)
-- ============================================
CREATE TABLE IF NOT EXISTS community_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  city VARCHAR(50) NOT NULL,
  event_date DATETIME NOT NULL,
  organizer_id INT NOT NULL,
  attendees_count INT DEFAULT 0,
  image_path VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_city (city),
  INDEX idx_event_date (event_date)
);

-- ============================================
-- EVENT ATTENDEES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS event_attendees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES community_events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_attendee (event_id, user_id)
);

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================

-- Insert sample cities for testing
INSERT IGNORE INTO users (name, email, password, state, city) VALUES
('Demo Admin', 'admin@demo.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyu', 'Maharashtra', 'Mumbai'),
('Test User', 'test@demo.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyu', 'Karnataka', 'Bangalore'),
('Community User', 'community@demo.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyu', 'Delhi', 'New Delhi');

-- Create indexes for performance
CREATE INDEX idx_review_city_date ON reviews(city, created_at);
CREATE INDEX idx_user_city ON users(city, state);
CREATE INDEX idx_pollution_city_type ON pollution_data(city, pollution_type);
