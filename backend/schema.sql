-- =====================================================
-- ORION Music Promotion Platform - MySQL Database Schema
-- Based on RANKSCIENCE logic with music branding
-- Run this file to create the database and tables
-- =====================================================

-- Create database (uncomment if needed)
-- CREATE DATABASE IF NOT EXISTS orion_db;
-- USE orion_db;

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    password VARCHAR(255) NOT NULL,
    withdraw_password VARCHAR(255) DEFAULT NULL,
    wallet_balance DECIMAL(15, 2) DEFAULT 0.00,
    commission_earned DECIMAL(15, 2) DEFAULT 0.00,
    level INT DEFAULT 1,
    status ENUM('active', 'suspended', 'banned') DEFAULT 'active',
    is_admin TINYINT(1) DEFAULT 0,
    invite_code VARCHAR(20) UNIQUE DEFAULT NULL,
    invitation_code VARCHAR(50) DEFAULT NULL,
    referrer_id INT DEFAULT NULL,
    first_deposit_bonus_paid TINYINT(1) DEFAULT 0,
    profile_picture VARCHAR(500) DEFAULT NULL,
    current_set INT DEFAULT 1,
    tasks_completed_today INT DEFAULT 0,
    last_task_reset_date DATE DEFAULT NULL,
    credit_score INT DEFAULT 100,
    daily_streak INT DEFAULT 0,
    last_streak_date DATE DEFAULT NULL,
    withdraw_type VARCHAR(50) DEFAULT NULL,
    saved_wallet_address VARCHAR(255) DEFAULT NULL,
    registration_bonus_shown TINYINT(1) DEFAULT 0,
    negative_balance_set INT DEFAULT NULL,
    negative_balance_submission INT DEFAULT NULL,
    negative_balance_amount DECIMAL(12,2) DEFAULT NULL,
    negative_balance_triggered TINYINT(1) DEFAULT 0,
    balance_before_negative DECIMAL(12,2) DEFAULT NULL,
    negative_trigger_product_price DECIMAL(12,2) DEFAULT NULL,
    pending_balance_restoration TINYINT(1) DEFAULT 0,
    last_seen DATETIME DEFAULT NULL,
    last_login DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_invite_code (invite_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- PRODUCTS TABLE (Albums/Songs displayed to users)
-- =====================================================
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    artist VARCHAR(255) DEFAULT NULL,
    image_path VARCHAR(500) DEFAULT NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    level1_price DECIMAL(12,2) DEFAULT 100.00,
    level2_price DECIMAL(12,2) DEFAULT 200.00,
    level3_price DECIMAL(12,2) DEFAULT 300.00,
    level4_price DECIMAL(12,2) DEFAULT 400.00,
    level5_price DECIMAL(12,2) DEFAULT 500.00,
    level1_commission DECIMAL(12,2) DEFAULT 0,
    level2_commission DECIMAL(12,2) DEFAULT 0,
    level3_commission DECIMAL(12,2) DEFAULT 0,
    level4_commission DECIMAL(12,2) DEFAULT 0,
    level5_commission DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- USER_PRODUCTS TABLE (Product/Album assignments)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    assigned_date DATE DEFAULT NULL,
    status ENUM('pending', 'in_progress', 'completed') DEFAULT 'pending',
    amount_earned DECIMAL(12,2) DEFAULT 0,
    commission_earned DECIMAL(12,2) DEFAULT 0,
    manual_bonus DECIMAL(12,2) DEFAULT 0,
    custom_price DECIMAL(12,2) DEFAULT NULL,
    is_manual TINYINT(1) DEFAULT 0,
    balance_before_start DECIMAL(12,2) DEFAULT NULL,
    submitted_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_product_id (product_id),
    INDEX idx_status (status),
    INDEX idx_assigned_date (assigned_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- COMMISSION_RATES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS commission_rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    level INT NOT NULL UNIQUE,
    rate DECIMAL(5,4) DEFAULT 0.0050,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_level (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default commission rates
INSERT INTO commission_rates (level, rate) VALUES 
    (1, 0.0050), 
    (2, 0.0100), 
    (3, 0.0150), 
    (4, 0.0200), 
    (5, 0.0250)
ON DUPLICATE KEY UPDATE rate = VALUES(rate);

-- =====================================================
-- LEVEL_SETTINGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS level_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    level INT NOT NULL UNIQUE,
    daily_task_limit INT DEFAULT 80,
    total_tasks_required INT DEFAULT 0,
    min_withdrawal_balance DECIMAL(12,2) DEFAULT 100.00,
    max_withdrawal_amount DECIMAL(12,2) DEFAULT 5000.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_level (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default level settings
INSERT INTO level_settings (level, daily_task_limit, total_tasks_required, min_withdrawal_balance, max_withdrawal_amount) VALUES 
    (1, 80, 0, 100, 5000),
    (2, 90, 200, 500, 10000),
    (3, 100, 500, 1500, 20000),
    (4, 110, 1000, 5000, 50000),
    (5, 120, 2000, 10000, 100000)
ON DUPLICATE KEY UPDATE 
    daily_task_limit = VALUES(daily_task_limit),
    total_tasks_required = VALUES(total_tasks_required);

-- =====================================================
-- BALANCE_EVENTS TABLE (Transaction history)
-- =====================================================
CREATE TABLE IF NOT EXISTS balance_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('assignment_debit','submission_credit','manual_adjustment','deposit','referral_commission','assignment_refund') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reference_date DATE DEFAULT NULL,
    details VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_type (type),
    INDEX idx_reference_date (reference_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- VOUCHERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS vouchers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    title VARCHAR(150) DEFAULT NULL,
    description TEXT DEFAULT NULL,
    image_path VARCHAR(500) NOT NULL,
    status ENUM('active','inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- POPUPS TABLE (User-specific popups)
-- =====================================================
CREATE TABLE IF NOT EXISTS popups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    url VARCHAR(500) DEFAULT NULL,
    image_path VARCHAR(500) DEFAULT NULL,
    status ENUM('pending','clicked','dismissed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    clicked_at TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- GLOBAL_POPUPS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS global_popups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    voucher_id INT DEFAULT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    image_path VARCHAR(500) DEFAULT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_is_active (is_active),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- GLOBAL_POPUP_DISMISSALS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS global_popup_dismissals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    global_popup_id INT NOT NULL,
    dismissed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_popup (user_id, global_popup_id),
    INDEX idx_user_id (user_id),
    INDEX idx_global_popup_id (global_popup_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- NOTIFICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_is_read (is_read),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- DEPOSITS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS deposits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    description VARCHAR(255) DEFAULT 'Account deposit',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- CHAT_MESSAGES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    message TEXT NOT NULL,
    sender_type ENUM('user','admin') NOT NULL,
    is_read TINYINT(1) DEFAULT 0,
    image_path VARCHAR(500) DEFAULT NULL,
    hidden_from_admin TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_sender_type (sender_type),
    INDEX idx_is_read (is_read),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- WITHDRAWAL_REQUESTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    username VARCHAR(100) DEFAULT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    wallet_address VARCHAR(255) NOT NULL,
    withdraw_type VARCHAR(50) DEFAULT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    admin_note TEXT,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- EVENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    image_path VARCHAR(500),
    event_date DATE,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_is_active (is_active),
    INDEX idx_event_date (event_date),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- WITHDRAW_PASSWORD_OTPS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS withdraw_password_otps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_otp_code (otp_code),
    INDEX idx_expires_at (expires_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- DEFAULT ADMIN USER (password: admin123)
-- =====================================================
-- The password hash below is for 'admin123'
INSERT INTO users (username, email, password, is_admin, invite_code, wallet_balance)
SELECT 'admin', 'admin@orion.com', '$2b$10$vCY2RvF7p4QJYz.9nVlbCuvCqLfVpwP7cXU5Ew8cqbLv2vKqJXzHy', 1, 'ADMIN1', 1000000.00
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin' OR is_admin = 1);

-- =====================================================
-- END OF SCHEMA
-- =====================================================
