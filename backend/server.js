const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS Configuration - Railway Compatible
const allowedOrigins = [
  process.env.FRONTEND_URL,
].filter(Boolean);

if ((process.env.NODE_ENV || 'development') !== 'production') {
  allowedOrigins.push('http://localhost:3000', 'http://localhost:5000');
}

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('railway.app')) {
      callback(null, true);
    } else {
      console.log('CORS allowed origin:', origin);
      callback(null, true);
    }
  },
  credentials: true
}));

// Middleware
app.use(express.json());

// Serve static files from the project root (Railway)
const STATIC_ROOT = path.join(__dirname, '..');
app.use(express.static(STATIC_ROOT));

// Serve uploads directory for product/voucher images
app.use('/backend/uploads', express.static(path.join(__dirname, 'uploads')));

// Response normalization middleware
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function(body) {
    try {
      if (body && typeof body === 'object') {
        const normalize = (obj) => {
          if (Array.isArray(obj)) return obj.map(normalize);
          if (obj && typeof obj === 'object') {
            const result = {};
            for (const [key, val] of Object.entries(obj)) {
              if (typeof val === 'string' && /^\d+(\.\d+)?$/.test(val)) {
                result[key] = parseFloat(val);
              } else if (val && typeof val === 'object') {
                result[key] = normalize(val);
              } else {
                result[key] = val;
              }
            }
            return result;
          }
          return obj;
        };
        body = normalize(body);
      }
    } catch (err) {
      console.error('Response normalization error:', err);
    }
    return originalJson.call(this, body);
  };
  next();
});

// File upload configuration - Railway compatible paths
const UPLOAD_BASE = path.join(__dirname, 'uploads');

// File filter for images only
const imageFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(UPLOAD_BASE, 'products');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: imageFileFilter
});

// Separate storage for vouchers
const voucherStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(UPLOAD_BASE, 'vouchers');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const uploadVoucherMulter = multer({ 
  storage: voucherStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: imageFileFilter
});

// Separate storage for profile pictures
const profilePictureStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(UPLOAD_BASE, 'profilepictures');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const uploadProfilePicture = multer({ storage: profilePictureStorage });

// Separate storage for event images
const eventImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(UPLOAD_BASE, 'events');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const uploadEventImage = multer({ storage: eventImageStorage });

// Separate storage for level icons
const levelIconStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(UPLOAD_BASE, 'levelicons');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Use level number as filename for easy access
    const level = req.params.level;
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `level${level}${ext}`);
  }
});
const uploadLevelIcon = multer({ storage: levelIconStorage });

// Separate storage for branding images (logo, background, landing)
const brandingStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(UPLOAD_BASE, 'logos');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Use the image_key as filename for predictable URLs
    const key = req.params.key || req.body.key || 'branding';
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${key}${ext}`);
  }
});
const uploadBranding = multer({ storage: brandingStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imageFileFilter });

// Database connection - Railway MySQL Configuration
// Support either discrete MYSQL* / DB_* env vars or a single DATABASE_URL
let dbConfig = {
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
  queueLimit: 0,
  decimalNumbers: true
};

// If a DATABASE_URL (mysql://user:pass@host:port/db) is provided, parse it first
const rawDbUrl = process.env.DATABASE_URL || process.env.CLEARDB_DATABASE_URL || process.env.MYSQL_URL;
if (rawDbUrl) {
  try {
    const parsed = new URL(rawDbUrl);
    dbConfig.host = parsed.hostname;
    dbConfig.port = Number(parsed.port || 3306);
    dbConfig.user = parsed.username;
    dbConfig.password = parsed.password;
    dbConfig.database = parsed.pathname ? parsed.pathname.replace(/^\//, '') : '';
  } catch (err) {
    console.warn('Failed to parse DATABASE_URL, falling back to individual env vars:', err.message);
  }
}

// Fill from discrete env vars if any piece missing - LOCAL DEVELOPMENT DEFAULTS
dbConfig.host = dbConfig.host || process.env.MYSQLHOST || process.env.DB_HOST || 'localhost';
dbConfig.port = dbConfig.port || Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306);
dbConfig.user = dbConfig.user || process.env.MYSQLUSER || process.env.DB_USER || 'calvin';
dbConfig.password = dbConfig.password || process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || 'calvin';
dbConfig.database = dbConfig.database || process.env.MYSQLDATABASE || process.env.DB_NAME || 'orion_db';

console.log('Database Config:', {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  password: dbConfig.password ? '***' : 'NOT SET'
});

const pool = mysql.createPool(dbConfig);

async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT 1');
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

async function ensureSchema() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS balance_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type ENUM('assignment_debit','submission_credit','manual_adjustment','deposit','referral_commission','assignment_refund') NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      reference_date DATE DEFAULT NULL,
      details VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (user_id),
      INDEX (type),
      INDEX (reference_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (err) {
    console.error('Schema ensure error:', err.message);
  }

  try {
    await pool.query('ALTER TABLE user_products ADD COLUMN manual_bonus DECIMAL(12,2) DEFAULT 0');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (manual_bonus):', err.message);
    }
  }

  try {
    await pool.query('ALTER TABLE user_products ADD COLUMN is_manual TINYINT(1) DEFAULT 0');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (is_manual):', err.message);
    }
  }

  try {
    await pool.query('ALTER TABLE user_products ADD COLUMN custom_price DECIMAL(12,2) DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (custom_price):', err.message);
    }
  }

  // Ensure user_products status column includes 'in_progress' 
  try {
    await pool.query("ALTER TABLE user_products MODIFY COLUMN status ENUM('pending', 'in_progress', 'completed') DEFAULT 'pending'");
    console.log('user_products.status column updated to include in_progress');
  } catch (err) {
    console.error('Schema alter error (user_products.status):', err.message);
  }

  // Update balance_events type column to include referral_commission and assignment_refund
  try {
    await pool.query("ALTER TABLE balance_events MODIFY COLUMN type ENUM('assignment_debit','submission_credit','manual_adjustment','deposit','referral_commission','assignment_refund') NOT NULL");
    console.log('balance_events.type column updated to include referral_commission and assignment_refund');
  } catch (err) {
    console.error('Schema alter error (balance_events.type):', err.message);
  }

  // Add balance_before_start column to track initial balance for proper credit calculation
  try {
    await pool.query('ALTER TABLE user_products ADD COLUMN balance_before_start DECIMAL(12,2) DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (balance_before_start):', err.message);
    }
  }

  // Add commission columns to products table
  for (let level = 1; level <= 5; level++) {
    try {
      await pool.query(`ALTER TABLE products ADD COLUMN level${level}_commission DECIMAL(12,2) DEFAULT 0`);
    } catch (err) {
      if (err && err.code !== 'ER_DUP_FIELDNAME') {
        console.error(`Schema alter error (level${level}_commission):`, err.message);
      }
    }
  }

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS vouchers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      title VARCHAR(150) DEFAULT NULL,
      description TEXT DEFAULT NULL,
      image_path VARCHAR(500) NOT NULL,
      status ENUM('active','inactive') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (status),
      INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (err) {
    console.error('Schema ensure error (vouchers):', err.message);
  }

  // Add invite code system columns
  try {
    await pool.query('ALTER TABLE users ADD COLUMN invite_code VARCHAR(20) UNIQUE DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (invite_code):', err.message);
    }
  }

  try {
    await pool.query('ALTER TABLE users ADD COLUMN referrer_id INT DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (referrer_id):', err.message);
    }
  }

  try {
    await pool.query('ALTER TABLE users ADD COLUMN first_deposit_bonus_paid TINYINT(1) DEFAULT 0');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (first_deposit_bonus_paid):', err.message);
    }
  }

  // Add last_seen column to track user activity
  try {
    await pool.query('ALTER TABLE users ADD COLUMN last_seen DATETIME DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (last_seen):', err.message);
    }
  }

  // Add image_path column to chat_messages for image support
  try {
    await pool.query('ALTER TABLE chat_messages ADD COLUMN image_path VARCHAR(500) DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (chat_messages.image_path):', err.message);
    }
  }

  // Add hidden_from_admin column to chat_messages to allow admin to clear their view
  try {
    await pool.query('ALTER TABLE chat_messages ADD COLUMN hidden_from_admin TINYINT(1) DEFAULT 0');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (chat_messages.hidden_from_admin):', err.message);
    }
  }

  try {
    await pool.query('ALTER TABLE users ADD COLUMN current_set INT DEFAULT 1');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (current_set):', err.message);
    }
  }

  try {
    await pool.query('ALTER TABLE users ADD COLUMN tasks_completed_today INT DEFAULT 0');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (tasks_completed_today):', err.message);
    }
  }

  try {
    await pool.query('ALTER TABLE users ADD COLUMN last_task_reset_date DATE DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (last_task_reset_date):', err.message);
    }
  }

  // Add profile_picture column
  try {
    await pool.query('ALTER TABLE users ADD COLUMN profile_picture VARCHAR(500) DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (profile_picture):', err.message);
    }
  }

  // Add withdraw_password column (hashed, set during registration)
  try {
    await pool.query('ALTER TABLE users ADD COLUMN withdraw_password VARCHAR(255) DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (withdraw_password):', err.message);
    }
  }

  // Add negative balance trigger fields
  try {
    await pool.query('ALTER TABLE users ADD COLUMN negative_balance_set INT DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (negative_balance_set):', err.message);
    }
  }

  try {
    await pool.query('ALTER TABLE users ADD COLUMN negative_balance_submission INT DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (negative_balance_submission):', err.message);
    }
  }

  try {
    await pool.query('ALTER TABLE users ADD COLUMN negative_balance_amount DECIMAL(12,2) DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (negative_balance_amount):', err.message);
    }
  }

  try {
    await pool.query('ALTER TABLE users ADD COLUMN negative_balance_triggered TINYINT(1) DEFAULT 0');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (negative_balance_triggered):', err.message);
    }
  }

  // Store user's balance before negative was applied (for restoration after clearing)
  try {
    await pool.query('ALTER TABLE users ADD COLUMN balance_before_negative DECIMAL(12,2) DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (balance_before_negative):', err.message);
    }
  }

  // Store the original product price for 10x commission calculation
  try {
    await pool.query('ALTER TABLE users ADD COLUMN negative_trigger_product_price DECIMAL(12,2) DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (negative_trigger_product_price):', err.message);
    }
  }

  // Flag to indicate user cleared negative and should get restoration on next submit
  try {
    await pool.query('ALTER TABLE users ADD COLUMN pending_balance_restoration TINYINT(1) DEFAULT 0');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (pending_balance_restoration):', err.message);
    }
  }

  // Add withdraw_type column for storing preferred crypto type
  try {
    await pool.query('ALTER TABLE users ADD COLUMN withdraw_type VARCHAR(50) DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (withdraw_type):', err.message);
    }
  }

  // Add saved_wallet_address column for storing user's wallet address for withdrawals
  try {
    await pool.query('ALTER TABLE users ADD COLUMN saved_wallet_address VARCHAR(255) DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (saved_wallet_address):', err.message);
    }
  }

  // Add registration_bonus_shown flag to track if user has seen the welcome bonus popup
  try {
    await pool.query('ALTER TABLE users ADD COLUMN registration_bonus_shown TINYINT(1) DEFAULT 0');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (registration_bonus_shown):', err.message);
    }
  }

  // Add phone column for user phone number
  try {
    await pool.query('ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT NULL AFTER email');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (phone):', err.message);
    }
  }

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS popups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      url VARCHAR(500) DEFAULT NULL,
      image_path VARCHAR(500) DEFAULT NULL,
      status ENUM('pending','clicked','dismissed') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      clicked_at TIMESTAMP NULL DEFAULT NULL,
      INDEX (user_id),
      INDEX (status),
      INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (err) {
    console.error('Schema ensure error (popups):', err.message);
  }

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      is_read TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (user_id),
      INDEX (is_read),
      INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (err) {
    console.error('Schema ensure error (notifications):', err.message);
  }

  // Create global_popups table for popups that show to all users on login
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS global_popups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      voucher_id INT DEFAULT NULL,
      title VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      image_path VARCHAR(500) DEFAULT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NULL DEFAULT NULL,
      INDEX (is_active),
      INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('✅ global_popups table ensured');
  } catch (err) {
    console.error('Schema ensure error (global_popups):', err.message);
  }

  // Create global_popup_dismissals to track which users have seen which global popups
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS global_popup_dismissals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      global_popup_id INT NOT NULL,
      dismissed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_popup (user_id, global_popup_id),
      INDEX (user_id),
      INDEX (global_popup_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('✅ global_popup_dismissals table ensured');
  } catch (err) {
    console.error('Schema ensure error (global_popup_dismissals):', err.message);
  }

  // Create deposits table to track deposit history
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS deposits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      description VARCHAR(255) DEFAULT 'Account deposit',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (user_id),
      INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('✅ deposits table ensured');
  } catch (err) {
    console.error('Schema ensure error (deposits):', err.message);
  }

  // Create chat_messages table
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS chat_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      message TEXT NOT NULL,
      sender_type ENUM('user','admin') NOT NULL,
      is_read TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (user_id),
      INDEX (sender_type),
      INDEX (is_read),
      INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('✅ chat_messages table ensured');
  } catch (err) {
    console.error('Schema ensure error (chat_messages):', err.message);
  }

  // Create withdrawal_requests table
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      username VARCHAR(100) NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      wallet_address VARCHAR(255) NOT NULL,
      withdraw_type VARCHAR(50) DEFAULT NULL,
      status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      admin_note TEXT,
      INDEX (user_id),
      INDEX (status),
      INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (err) {
    console.error('Schema ensure error (withdrawal_requests):', err.message);
  }

  // Add withdraw_type column to existing withdrawal_requests table
  try {
    await pool.query('ALTER TABLE withdrawal_requests ADD COLUMN withdraw_type VARCHAR(50) DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (withdrawal_requests.withdraw_type):', err.message);
    }
  }

  // Add username column to existing withdrawal_requests table if missing
  try {
    await pool.query('ALTER TABLE withdrawal_requests ADD COLUMN username VARCHAR(100) DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (withdrawal_requests.username):', err.message);
    }
  }

  // Fix payment_method column if it exists without a default value
  try {
    await pool.query('ALTER TABLE withdrawal_requests MODIFY COLUMN payment_method VARCHAR(100) DEFAULT NULL');
  } catch (err) {
    // Column might not exist, which is fine
    if (err && err.code !== 'ER_BAD_FIELD_ERROR') {
      console.error('Schema alter error (withdrawal_requests.payment_method):', err.message);
    }
  }

  // Drop payment_method column if it exists (we use withdraw_type instead)
  try {
    await pool.query('ALTER TABLE withdrawal_requests DROP COLUMN payment_method');
    console.log('✅ Dropped old payment_method column from withdrawal_requests');
  } catch (err) {
    // Column might not exist, which is fine
  }

  // Drop old 'withdraws' table if it exists (we use withdrawal_requests instead)
  try {
    await pool.query('DROP TABLE IF EXISTS withdraws');
    console.log('✅ Dropped old withdraws table (using withdrawal_requests instead)');
  } catch (err) {
    console.error('Error dropping old withdraws table:', err.message);
  }

  // Create events table (for admin-uploaded events visible to all users)
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      image_path VARCHAR(500),
      event_date DATE,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (is_active),
      INDEX (event_date),
      INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('✅ events table ensured');
  } catch (err) {
    console.error('Schema ensure error (events):', err.message);
  }

  // Create withdraw_password_otps table for password reset OTPs
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS withdraw_password_otps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      otp_code VARCHAR(10) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (user_id),
      INDEX (otp_code),
      INDEX (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('✅ withdraw_password_otps table ensured');
  } catch (err) {
    console.error('Schema ensure error (withdraw_password_otps):', err.message);
  }

  // Create branding_images table for site logo, background, and landing images
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS branding_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      image_key VARCHAR(50) NOT NULL UNIQUE,
      image_path VARCHAR(500) NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (image_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('✅ branding_images table ensured');
  } catch (err) {
    console.error('Schema ensure error (branding_images):', err.message);
  }
}

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return {
    ...rest,
    isAdmin: !!(rest.is_admin || rest.isAdmin),
    level: Number(rest.level) || 1,
    wallet_balance: typeof rest.wallet_balance === 'number' ? rest.wallet_balance : parseFloat(rest.wallet_balance || 0) || 0,
    commission_earned: typeof rest.commission_earned === 'number' ? rest.commission_earned : parseFloat(rest.commission_earned || 0) || 0,
    tasks_completed_at_level: Number(rest.tasks_completed_at_level) || 0,
    total_tasks_completed: Number(rest.total_tasks_completed) || 0,
    credit_score: Number(rest.credit_score) || 100,
    profile_picture: rest.profile_picture || null,
    invite_code: rest.invite_code || null,
    invitation_code: rest.invitation_code || null,
    current_set: Number(rest.current_set) || 1,
    tasks_completed_today: Number(rest.tasks_completed_today) || 0,
    // For bonus commission calculation on pending products with negative balance
    balance_before_negative: rest.balance_before_negative ? Number(rest.balance_before_negative) : null,
    negative_trigger_amount: rest.negative_trigger_product_price ? Number(rest.negative_trigger_product_price) : null,
    // Payment method settings
    withdraw_type: rest.withdraw_type || null,
    saved_wallet_address: rest.saved_wallet_address || null,
    // Registration bonus tracking
    registration_bonus_shown: Number(rest.registration_bonus_shown) || 0
  };
}

function sanitizeUserProduct(row) {
  if (!row) return null;

  const sanitizeNumber = (value) => (typeof value === 'number' ? value : Number(value || 0));
  const sanitizeStatus = (value) => {
    const normalized = (value || '').toString().trim().toLowerCase();
    return normalized || 'pending';
  };

  const product = {
    id: row.assignment_id !== undefined ? row.assignment_id : row.id,
    product_id: row.product_id !== undefined ? row.product_id : (row.productId !== undefined ? row.productId : null),
    name: row.name,
    image_path: row.image_path,
    status: sanitizeStatus(row.status),
    amount_earned: sanitizeNumber(row.amount_earned),
    commission_earned: sanitizeNumber(row.commission_earned),
    assigned_date: row.assigned_date,
    submitted_at: row.submitted_at,
    manual_bonus: sanitizeNumber(row.manual_bonus),
    custom_price: row.custom_price !== null && row.custom_price !== undefined ? sanitizeNumber(row.custom_price) : null,
    is_manual: Number(row.is_manual || 0)
  };

  // Only include price levels (commission is calculated from commission_rates table)
  for (let i = 1; i <= 5; i++) {
    const priceKey = `level${i}_price`;
    if (row[priceKey] !== undefined) {
      product[priceKey] = sanitizeNumber(row[priceKey]);
    }
  }

  return product;
}

// Level-based task limits configuration
// Level 1: 135 tasks (3 sets of 45)
// Level 2: 150 tasks (3 sets of 50)
// Level 3: 165 tasks (3 sets of 55)
// Level 4: 180 tasks (3 sets of 60)
function getTaskLimitsForLevel(level) {
  const limits = {
    1: { total: 135, perSet: 45 },
    2: { total: 150, perSet: 50 },
    3: { total: 165, perSet: 55 },
    4: { total: 180, perSet: 60 }
  };
  return limits[level] || limits[1]; // Default to level 1 if unknown
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Missing Authorization header' });
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'test-secret');
    req.user = payload;
    
    // Update last_seen timestamp for non-admin users
    if (payload.userId && !payload.isAdmin) {
      pool.query('UPDATE users SET last_seen = NOW() WHERE id = ?', [payload.userId]).catch(err => {
        console.error('Failed to update last_seen:', err);
      });
    }
    
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });
  next();
}

app.get('/api/test', (req, res) => {
  res.json({ message: 'Orion Music API is working!', timestamp: new Date() });
});

app.get('/api/health', async (req, res) => {
  const dbStatus = await testConnection();
  res.json({
    status: 'OK',
    database: dbStatus ? 'Connected' : 'Disconnected',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date()
  });
});

// ----------------------
// Helper Functions
// ----------------------

// Generate unique invite code
async function generateUniqueInviteCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let exists = true;
  
  while (exists) {
    code = 'OR';
    for (let i = 0; i < 3; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    const [rows] = await pool.query('SELECT id FROM users WHERE invite_code = ? LIMIT 1', [code]);
    exists = rows.length > 0;
  }
  
  return code;
}

// ----------------------
// Auth routes
// ----------------------

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, inviteCode, withdrawPassword } = req.body;
  // email field contains phone number from frontend
  const phone = email;
  if (!username || !phone || !password) return res.status(400).json({ error: 'Missing fields' });
  if (!inviteCode) return res.status(400).json({ error: 'Invite code is required to register' });
  if (!withdrawPassword) return res.status(400).json({ error: 'Withdraw password is required' });
  if (withdrawPassword.length < 4) return res.status(400).json({ error: 'Withdraw password must be at least 4 characters' });
  
  try {
    // Check if username or phone exists
    const [exists] = await pool.query('SELECT id FROM users WHERE username = ? OR phone = ? OR email = ? LIMIT 1', [username, phone, phone]);
    if (exists.length > 0) return res.status(400).json({ error: 'User or phone number already exists' });

    // Verify invite code exists - check both invite_code (new) and invitation_code (old) for backward compatibility
    const [referrerRows] = await pool.query(
      'SELECT id, username FROM users WHERE invite_code = ? OR invitation_code = ? LIMIT 1', 
      [inviteCode, inviteCode]
    );
    if (referrerRows.length === 0) return res.status(400).json({ error: 'Invalid invite code' });
    
    const referrerId = referrerRows[0].id;
    const hashed = await bcrypt.hash(password, 10);
    const hashedWithdrawPassword = await bcrypt.hash(withdrawPassword, 10);
    const newInviteCode = await generateUniqueInviteCode();
    const invitation_code = 'INV' + Date.now().toString().slice(-6); // Keep for backward compatibility
    
    // Registration bonus amount
    const REGISTRATION_BONUS = 20.00;
    
    // Insert new user with referrer, withdraw password, and registration bonus
    // Use phone number, generate a placeholder email from username
    const generatedEmail = `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@orion.user`;
    const [result] = await pool.query(
      'INSERT INTO users (username, email, phone, password, withdraw_password, invitation_code, invite_code, referrer_id, status, wallet_balance, registration_bonus_shown) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
      [username, generatedEmail, phone, hashed, hashedWithdrawPassword, invitation_code, newInviteCode, referrerId, 'active', REGISTRATION_BONUS, 0]
    );
    
    const userId = result.insertId;
    const token = jwt.sign({ userId, username, isAdmin: false }, process.env.JWT_SECRET || 'test-secret');
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    
    // Create notification for referrer
    await pool.query(
      'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
      [referrerId, 'New Referral', `${username} registered using your invite code!`]
    );
    
    // Create notification for new user about their bonus
    await pool.query(
      'INSERT INTO notifications (user_id, title, message, is_read) VALUES (?, ?, ?, 0)',
      [userId, '🎉 Welcome Bonus!', `Congratulations! You have received a $${REGISTRATION_BONUS.toFixed(2)} registration bonus. Start completing tasks to earn more!`]
    );
    
    console.log(`[REGISTRATION] New user ${username} (ID: ${userId}) received $${REGISTRATION_BONUS} registration bonus`);
    
    res.json({ token, user: sanitizeUser(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  
  try {
    // Support login with username, email, or phone
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ? OR email = ? OR phone = ? LIMIT 1', [username, username, username]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ 
      userId: user.id, 
      username: user.username,
      isAdmin: !!user.is_admin 
    }, process.env.JWT_SECRET || 'test-secret');

    // Auto-generate invite code if user doesn't have one
    if (!user.invite_code) {
      const newCode = await generateUniqueInviteCode();
      await pool.query('UPDATE users SET invite_code = ? WHERE id = ?', [newCode, user.id]);
      user.invite_code = newCode;
    }

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    res.json({
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/user/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await pool.query(
      `SELECT 
         up.id AS assignment_id,
         up.status,
         up.amount_earned,
         up.commission_earned,
         up.manual_bonus,
         up.custom_price,
         up.is_manual,
         up.assigned_date,
         up.submitted_at,
         p.id AS product_id,
         p.name,
         p.image_path,
         p.level1_price,
         p.level2_price,
         p.level3_price,
         p.level4_price,
         p.level5_price
       FROM user_products up
       JOIN products p ON up.product_id = p.id
       WHERE up.user_id = ?
       ORDER BY 
         CASE 
           WHEN up.status = 'in_progress' THEN 0 
           WHEN up.status = 'pending' THEN 1 
           ELSE 2 
         END,
         up.assigned_date ASC,
         up.id ASC
       LIMIT 200`,
      [userId]
    );
    res.json(rows.map(sanitizeUserProduct));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.get('/api/user/products-public', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id as product_id, name, image_path, level1_price, level2_price, level3_price, level4_price, level5_price FROM products WHERE status = "active" ORDER BY id DESC LIMIT 500'
    );
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get level progress - total completed products vs required for current level
app.get('/api/user/level-progress', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get user's current level
    const [userRows] = await pool.query('SELECT level FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!userRows[0]) return res.status(404).json({ error: 'User not found' });
    
    const userLevel = userRows[0].level;
    
    // Get level settings for total tasks required
    const [levelSettings] = await pool.query(
      'SELECT daily_task_limit, total_tasks_required FROM level_settings WHERE level = ? LIMIT 1',
      [userLevel]
    );
    
    const dailyLimit = levelSettings[0]?.daily_task_limit || 40;
    const totalRequired = levelSettings[0]?.total_tasks_required || 0;
    
    // Get total completed products for this level (all time at current level)
    const [completedRows] = await pool.query(
      'SELECT COUNT(*) as total_completed FROM user_products WHERE user_id = ? AND status = "completed"',
      [userId]
    );
    
    const totalCompleted = completedRows[0]?.total_completed || 0;
    
    // Get completed today
    const [todayRows] = await pool.query(
      'SELECT COUNT(*) as completed_today FROM user_products WHERE user_id = ? AND status = "completed" AND DATE(submitted_at) = CURDATE()',
      [userId]
    );
    
    const completedToday = todayRows[0]?.completed_today || 0;
    
    res.json({
      userLevel,
      dailyLimit,
      totalRequired,
      totalCompleted,
      completedToday,
      remainingForLevelUp: Math.max(0, totalRequired - totalCompleted)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch level progress' });
  }
});

// Withdrawal request endpoint (user submits withdrawal)
const handleWithdrawalRequest = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount, walletAddress, wallet_address, withdrawPassword, withdrawType, withdraw_type } = req.body;
    const address = wallet_address || walletAddress;
    const cryptoType = withdraw_type || withdrawType || null;
    
    console.log('Withdrawal request:', { userId, amount, address, cryptoType });
    
    if (!amount || !address) {
      return res.status(400).json({ error: 'Amount and wallet address are required' });
    }
    
    if (!withdrawPassword) {
      return res.status(400).json({ error: 'Withdraw password is required' });
    }
    
    if (isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    const [userRows] = await pool.query('SELECT username, wallet_balance, commission_earned, withdraw_password, withdraw_type, saved_wallet_address FROM users WHERE id = ? LIMIT 1', [userId]);
    const user = userRows[0];
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify withdraw password
    if (!user.withdraw_password) {
      return res.status(400).json({ error: 'Withdraw password not set. Please contact support.' });
    }
    
    const passwordMatch = await bcrypt.compare(withdrawPassword, user.withdraw_password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid withdraw password' });
    }
    
    // Users withdraw from commission_earned (which is also part of wallet_balance)
    const commissionEarned = Number(user.commission_earned) || 0;
    console.log('User commission_earned:', commissionEarned, 'wallet_balance:', user.wallet_balance, 'Requested amount:', amount);
    
    if (commissionEarned < Number(amount)) {
      return res.status(400).json({ error: 'Insufficient commission earned. You can only withdraw from your earned commissions.' });
    }
    
    // Check if user already has a pending withdrawal
    const [pendingRows] = await pool.query(
      'SELECT id FROM withdrawal_requests WHERE user_id = ? AND status = ? LIMIT 1',
      [userId, 'pending']
    );
    
    if (pendingRows.length > 0) {
      return res.status(400).json({ error: 'You already have a pending withdrawal request. Please wait for admin approval or rejection.' });
    }
    
    // Use provided crypto type or fall back to user's saved withdraw type
    const finalCryptoType = cryptoType || user.withdraw_type || null;
    
    // Insert into withdrawal_requests table (balance NOT deducted yet)
    console.log('🟢 SERVER: Inserting withdrawal request:', {
      userId,
      username: user.username,
      amount: Number(amount),
      wallet_address: address,
      withdraw_type: finalCryptoType,
      status: 'pending'
    });
    
    const [insertResult] = await pool.query(
      'INSERT INTO withdrawal_requests (user_id, username, amount, wallet_address, withdraw_type, status) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, user.username, Number(amount), address, finalCryptoType, 'pending']
    );
    
    console.log('🟢 SERVER: Withdrawal request inserted successfully! Insert ID:', insertResult.insertId);
    res.json({ success: true, message: 'Withdrawal request submitted successfully. Please wait for admin approval.' });
  } catch (err) {
    console.error('Withdrawal request error:', err);
    res.status(500).json({ error: 'Withdrawal request failed: ' + err.message });
  }
};

app.post('/api/user/withdraw-request', authMiddleware, handleWithdrawalRequest);
app.post('/api/withdrawals/request', authMiddleware, handleWithdrawalRequest);

app.get('/api/user/withdrawals', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await pool.query(
      'SELECT id, amount, wallet_address, withdraw_type, status, admin_note, requested_at, processed_at FROM withdrawal_requests WHERE user_id = ? ORDER BY requested_at DESC',
      [userId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error('Failed to fetch user withdrawals:', err);
    res.status(500).json({ error: 'Failed to fetch withdrawals: ' + err.message });
  }
});

// Get user deposit history
app.get('/api/user/deposits', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await pool.query(
      'SELECT id, amount, description, created_at FROM deposits WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch deposits' });
  }
});

// Get all product images for display grid
app.get('/api/products/images', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, image_path FROM products WHERE status = "active" AND image_path IS NOT NULL ORDER BY RAND() LIMIT 20'
    );
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch product images' });
  }
});

app.put('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { paymentName, cryptoWallet, walletAddress } = req.body;
    await pool.query('UPDATE users SET payment_name = ?, crypto_wallet = ?, wallet_address = ? WHERE id = ?', [paymentName, cryptoWallet, walletAddress, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Save payment method settings (withdraw type and wallet address)
app.put('/api/user/payment-method', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { withdrawType, walletAddress } = req.body;
    
    if (!withdrawType || !walletAddress) {
      return res.status(400).json({ error: 'Please select a withdraw type and enter a wallet address' });
    }
    
    const validTypes = ['BTC', 'LTC', 'USDC-ERC20', 'USDT-TRC20', 'SOL', 'ETH'];
    if (!validTypes.includes(withdrawType)) {
      return res.status(400).json({ error: 'Invalid withdraw type selected' });
    }
    
    if (walletAddress.length < 10) {
      return res.status(400).json({ error: 'Please enter a valid wallet address' });
    }
    
    await pool.query('UPDATE users SET withdraw_type = ?, saved_wallet_address = ? WHERE id = ?', [withdrawType, walletAddress, userId]);
    
    // Fetch updated user data
    const [userRows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Payment method saved successfully',
      user: sanitizeUser(userRows[0])
    });
  } catch (err) {
    console.error('Save payment method error:', err);
    res.status(500).json({ error: 'Failed to save payment method' });
  }
});

// Get user's payment method settings
app.get('/api/user/payment-method', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await pool.query('SELECT withdraw_type, saved_wallet_address FROM users WHERE id = ? LIMIT 1', [userId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      withdraw_type: rows[0].withdraw_type || null,
      saved_wallet_address: rows[0].saved_wallet_address || null
    });
  } catch (err) {
    console.error('Get payment method error:', err);
    res.status(500).json({ error: 'Failed to get payment method' });
  }
});

// Profile picture upload endpoint
app.post('/api/user/profile-picture', authMiddleware, uploadProfilePicture.single('profilePicture'), async (req, res) => {
  try {
    const userId = req.user.userId;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const profilePicturePath = '/backend/uploads/profilepictures/' + req.file.filename;
    
    // Update user's profile picture in database
    await pool.query('UPDATE users SET profile_picture = ? WHERE id = ?', [profilePicturePath, userId]);
    
    // Fetch updated user data
    const [userRows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      profile_picture: profilePicturePath,
      user: sanitizeUser(userRows[0])
    });
  } catch (err) {
    console.error('Profile picture upload error:', err);
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
});

app.put('/api/user/password', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Missing fields' });
    const [rows] = await pool.query('SELECT password FROM users WHERE id = ? LIMIT 1', [userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(oldPassword, rows[0].password);
    if (!ok) return res.status(400).json({ error: 'Old password incorrect' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Change password endpoint (POST version)
app.post('/api/user/change-password', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Please provide current and new password' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    
    const [rows] = await pool.query('SELECT password FROM users WHERE id = ? LIMIT 1', [userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    
    const isValidPassword = await bcrypt.compare(currentPassword, rows[0].password);
    if (!isValidPassword) return res.status(400).json({ error: 'Current password is incorrect' });
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Mark registration bonus popup as shown
app.post('/api/user/bonus-shown', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    await pool.query('UPDATE users SET registration_bonus_shown = 1 WHERE id = ?', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to mark bonus as shown:', err);
    res.status(500).json({ error: 'Failed to update' });
  }
});

app.post('/api/user/change-withdraw-password', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentWithdrawPassword, newWithdrawPassword } = req.body;
    if (!currentWithdrawPassword || !newWithdrawPassword) return res.status(400).json({ error: 'Please provide current and new withdraw password' });
    if (newWithdrawPassword.length < 4) return res.status(400).json({ error: 'Withdraw password must be at least 4 characters' });
    
    const [rows] = await pool.query('SELECT withdraw_password FROM users WHERE id = ? LIMIT 1', [userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    
    if (!rows[0].withdraw_password) {
      return res.status(400).json({ error: 'Withdraw password not set. Please contact support.' });
    }
    
    const isValidPassword = await bcrypt.compare(currentWithdrawPassword, rows[0].withdraw_password);
    if (!isValidPassword) return res.status(400).json({ error: 'Current withdraw password is incorrect' });
    
    const hashedPassword = await bcrypt.hash(newWithdrawPassword, 10);
    await pool.query('UPDATE users SET withdraw_password = ? WHERE id = ?', [hashedPassword, userId]);
    res.json({ success: true, message: 'Withdraw password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change withdraw password' });
  }
});

// Reset withdraw password using OTP from customer care
app.post('/api/user/reset-withdraw-password', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { otp, newWithdrawPassword } = req.body;
    
    if (!otp || !newWithdrawPassword) {
      return res.status(400).json({ error: 'OTP and new withdraw password are required' });
    }
    
    if (newWithdrawPassword.length < 4) {
      return res.status(400).json({ error: 'Withdraw password must be at least 4 characters' });
    }
    
    // Find valid OTP for this user
    const [otpRows] = await pool.query(
      'SELECT id, expires_at FROM withdraw_password_otps WHERE user_id = ? AND otp_code = ? AND used = 0 ORDER BY created_at DESC LIMIT 1',
      [userId, otp]
    );
    
    if (otpRows.length === 0) {
      return res.status(400).json({ error: 'Invalid OTP. Please contact customer care for a new code.' });
    }
    
    const otpRecord = otpRows[0];
    
    // Check if OTP has expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      return res.status(400).json({ error: 'OTP has expired. Please contact customer care for a new code.' });
    }
    
    // Mark OTP as used
    await pool.query('UPDATE withdraw_password_otps SET used = 1 WHERE id = ?', [otpRecord.id]);
    
    // Update the withdraw password
    const hashedPassword = await bcrypt.hash(newWithdrawPassword, 10);
    await pool.query('UPDATE users SET withdraw_password = ? WHERE id = ?', [hashedPassword, userId]);
    
    console.log(`User ${userId} reset withdraw password using OTP`);
    
    res.json({ success: true, message: 'Withdraw password reset successfully' });
  } catch (err) {
    console.error('Failed to reset withdraw password:', err);
    res.status(500).json({ error: 'Failed to reset withdraw password' });
  }
});

app.post('/api/user/deposit', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid deposit amount' });
    
    const depositAmount = Number(amount);
    
    // Get user info including referrer and first deposit status
    const [userRows] = await pool.query(
      'SELECT wallet_balance, referrer_id, first_deposit_bonus_paid FROM users WHERE id = ? LIMIT 1', 
      [userId]
    );
    const user = userRows[0];
    
    // Update user balance
    await pool.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [depositAmount, userId]);
    await pool.query('INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "deposit", ?, CURDATE(), ?)', [userId, depositAmount, `Deposit of ${depositAmount.toFixed(2)}`]);
    
    // If this is first deposit and user has a referrer, give 10% bonus to referrer
    if (user.referrer_id && !user.first_deposit_bonus_paid) {
      const bonusAmount = depositAmount * 0.10; // 10% bonus
      
      await pool.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [bonusAmount, user.referrer_id]);
      await pool.query('INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "deposit", ?, CURDATE(), ?)', 
        [user.referrer_id, bonusAmount, `Referral bonus (10% of ${depositAmount.toFixed(2)})`]
      );
      
      // Mark bonus as paid
      await pool.query('UPDATE users SET first_deposit_bonus_paid = 1 WHERE id = ?', [userId]);
      
      // Notify referrer
      await pool.query(
        'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
        [user.referrer_id, 'Referral Bonus Earned!', `You earned $${bonusAmount.toFixed(2)} from your referral's first deposit!`]
      );
      
      console.log(`Paid referral bonus: $${bonusAmount.toFixed(2)} to user ${user.referrer_id}`);
    }
    
    const [updatedUserRows] = await pool.query('SELECT wallet_balance FROM users WHERE id = ? LIMIT 1', [userId]);
    res.json({ success: true, newBalance: updatedUserRows[0].wallet_balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Deposit failed' });
  }
});

// ----------------------
// Admin routes
// ----------------------

async function assignProductsToAllUsers(productIds = null) {
  console.log('[ASSIGN FUNCTION] Starting with productIds:', productIds);
  
  const [users] = await pool.query('SELECT id, level FROM users WHERE is_admin = 0 AND COALESCE(status, "active") = "active"');
  console.log(`[ASSIGN FUNCTION] Found ${users.length} active users`);
  
  if (!users.length) {
    console.log('[ASSIGN FUNCTION] No users found, returning');
    return { usersAssigned: 0, assignments: 0 };
  }

  let productRows;
  if (Array.isArray(productIds) && productIds.length > 0) {
    const cleanedIds = [...new Set(productIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0))];
    console.log('[ASSIGN FUNCTION] Cleaned product IDs:', cleanedIds);
    
    if (cleanedIds.length === 0) {
      throw new Error('No valid products selected');
    }
    const placeholders = cleanedIds.map(() => '?').join(',');
    const [rows] = await pool.query(`SELECT id FROM products WHERE status = "active" AND id IN (${placeholders})`, cleanedIds);
    productRows = rows;
    console.log(`[ASSIGN FUNCTION] Found ${productRows.length} active products from selected IDs`);
  } else {
    const [rows] = await pool.query('SELECT id FROM products WHERE status = "active"');
    productRows = rows;
    console.log(`[ASSIGN FUNCTION] Found ${productRows.length} active products (all)`);
  }

  if (!productRows.length) {
    console.log('[ASSIGN FUNCTION] No active products available');
    throw new Error('No active products available for assignment');
  }

  let totalAssignments = 0;

  for (const user of users) {
    // Level-based task limits: L1=135 (3x45), L2=150 (3x50), L3=165 (3x55), L4=180 (3x60)
    const taskLimits = getTaskLimitsForLevel(user.level || 1);
    const tasksPerDay = taskLimits.total;
    
    console.log(`[AUTO ASSIGN] User ${user.id} (Level ${user.level}): Assigning ${tasksPerDay} tasks (${taskLimits.perSet} per set)`);

    // Assign products randomly (no duplicates per day)
    let userAssignments = 0;
    const assignedProducts = new Set();
    
    while (userAssignments < tasksPerDay && assignedProducts.size < productRows.length) {
      const randomProduct = productRows[Math.floor(Math.random() * productRows.length)].id;
      
      // Skip if already assigned today
      if (assignedProducts.has(randomProduct)) continue;
      assignedProducts.add(randomProduct);
      
      const [insertResult] = await pool.query(
        'INSERT IGNORE INTO user_products (user_id, product_id, assigned_date, status, manual_bonus, is_manual) VALUES (?, ?, CURDATE(), ?, 0, 0)',
        [user.id, randomProduct, 'pending']
      );
      
      if (insertResult.affectedRows > 0) {
        totalAssignments += 1;
        userAssignments += 1;
        console.log(`[AUTO ASSIGN] User ${user.id}: Assigned product ${randomProduct} (${userAssignments}/${tasksPerDay})`);
      }
    }
    
    console.log(`[AUTO ASSIGN] User ${user.id}: Total new assignments = ${userAssignments}`);

    // NOTE: Balance is NO LONGER deducted at assignment time for auto-assigned products.
    // Instead, balance is deducted when user clicks "Start" on each product in the queue.
    // This creates a queue-based system where products are processed one at a time.
    console.log(`[AUTO ASSIGN] User ${user.id}: Products queued (no upfront deduction)`);
  }

  return { usersAssigned: users.length, assignments: totalAssignments };
}

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const search = req.query.search || '';
    let rows;
    if (search) {
      const q = `%${search}%`;
      [rows] = await pool.query('SELECT * FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 500', [q, q]);
    } else {
      [rows] = await pool.query('SELECT * FROM users ORDER BY id DESC LIMIT 500');
    }
    res.json(rows.map(sanitizeUser));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/admin/popup', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, title, message, url, voucherId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }
    let finalTitle = title || '';
    let finalMessage = message || '';
    let imagePath = null;
    let isVoucher = false;
    if (voucherId) {
      isVoucher = true;
      const [[voucher]] = await pool.query('SELECT * FROM vouchers WHERE id = ? AND status = "active" LIMIT 1', [voucherId]);
      if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
      imagePath = voucher.image_path;
      if (!finalTitle) finalTitle = voucher.title || voucher.name || 'Congratulations! 🎉';
      if (!finalMessage) {
        finalMessage = voucher.description || '🎊 Congratulations! You have received a special voucher! 🎊';
      }
    }
    if (!finalTitle) {
      return res.status(400).json({ error: 'Title is required (either pass directly or via voucher)' });
    }
    if (isVoucher && !message && !finalMessage) {
      finalMessage = '🎊 Congratulations! You have received a special voucher! 🎊';
    }
    await pool.query(
      'INSERT INTO popups (user_id, title, message, url, image_path, status) VALUES (?, ?, ?, ?, ?, "pending")',
      [userId, finalTitle, finalMessage || '', url || null, imagePath]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create popup' });
  }
});

app.post('/api/admin/notify', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, title, message } = req.body || {};
    if (!userId || !title || !message) {
      return res.status(400).json({ error: 'Missing userId, title or message' });
    }
    await pool.query(
      'INSERT INTO notifications (user_id, title, message, is_read) VALUES (?, ?, ?, 0)',
      [userId, title, message]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// ==================== GLOBAL POPUPS (for all users on login) ====================

// Create a global popup (voucher that shows to all users)
app.post('/api/admin/global-popup', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { voucherId, title, message, expiresInDays } = req.body || {};
    
    let finalTitle = title || '';
    let finalMessage = message || '';
    let imagePath = null;
    
    if (voucherId) {
      const [[voucher]] = await pool.query('SELECT * FROM vouchers WHERE id = ? AND status = "active" LIMIT 1', [voucherId]);
      if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
      imagePath = voucher.image_path;
      if (!finalTitle) finalTitle = voucher.title || voucher.name || 'Special Announcement! 🎉';
      if (!finalMessage) {
        finalMessage = voucher.description || '🎊 Check out this special offer! 🎊';
      }
    }
    
    if (!finalTitle) {
      return res.status(400).json({ error: 'Title is required (either pass directly or via voucher)' });
    }
    
    // Calculate expiry date if provided
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays));
    }
    
    const [result] = await pool.query(
      'INSERT INTO global_popups (voucher_id, title, message, image_path, is_active, expires_at) VALUES (?, ?, ?, ?, 1, ?)',
      [voucherId || null, finalTitle, finalMessage || '', imagePath, expiresAt]
    );
    
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('Global popup creation error:', err);
    res.status(500).json({ error: 'Failed to create global popup' });
  }
});

// Get all global popups (admin)
app.get('/api/admin/global-popups', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT gp.*, v.name as voucher_name 
      FROM global_popups gp 
      LEFT JOIN vouchers v ON gp.voucher_id = v.id 
      ORDER BY gp.created_at DESC
    `);
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch global popups' });
  }
});

// Toggle global popup active status
app.put('/api/admin/global-popup/:id/toggle', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [[popup]] = await pool.query('SELECT is_active FROM global_popups WHERE id = ?', [id]);
    if (!popup) return res.status(404).json({ error: 'Global popup not found' });
    
    const newStatus = popup.is_active ? 0 : 1;
    await pool.query('UPDATE global_popups SET is_active = ? WHERE id = ?', [newStatus, id]);
    res.json({ success: true, is_active: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to toggle global popup' });
  }
});

// Delete global popup
app.delete('/api/admin/global-popup/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM global_popup_dismissals WHERE global_popup_id = ?', [id]);
    await pool.query('DELETE FROM global_popups WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete global popup' });
  }
});

// Get pending global popup for current user (check on login/dashboard load)
app.get('/api/user/global-popup', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get active global popups that this user hasn't dismissed yet and haven't expired
    const [rows] = await pool.query(`
      SELECT gp.* FROM global_popups gp
      WHERE gp.is_active = 1
      AND (gp.expires_at IS NULL OR gp.expires_at > NOW())
      AND gp.id NOT IN (
        SELECT global_popup_id FROM global_popup_dismissals WHERE user_id = ?
      )
      ORDER BY gp.created_at DESC
      LIMIT 1
    `, [userId]);
    
    if (rows.length === 0) {
      return res.json({ popup: null });
    }
    
    res.json({ popup: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch global popup' });
  }
});

// Dismiss global popup for current user
app.post('/api/user/global-popup/:id/dismiss', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const popupId = req.params.id;
    
    // Insert dismissal record (ignore if already exists)
    await pool.query(
      'INSERT IGNORE INTO global_popup_dismissals (user_id, global_popup_id) VALUES (?, ?)',
      [userId, popupId]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to dismiss global popup' });
  }
});

// ==================== EVENTS MANAGEMENT ====================

// Get all events (admin)
app.get('/api/admin/events', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM events ORDER BY created_at DESC');
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Create event (admin)
app.post('/api/admin/events', authMiddleware, adminMiddleware, uploadEventImage.single('image'), async (req, res) => {
  try {
    const { title, description, event_date, is_active } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const imagePath = req.file ? '/uploads/events/' + req.file.filename : null;
    
    const [result] = await pool.query(
      'INSERT INTO events (title, description, image_path, event_date, is_active) VALUES (?, ?, ?, ?, ?)',
      [title, description || null, imagePath, event_date || null, is_active !== undefined ? is_active : 1]
    );
    
    res.json({ success: true, id: result.insertId, image_path: imagePath });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event (admin)
app.put('/api/admin/events/:id', authMiddleware, adminMiddleware, uploadEventImage.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, event_date, is_active } = req.body;
    
    let imagePath = null;
    if (req.file) {
      imagePath = '/uploads/events/' + req.file.filename;
    }
    
    if (imagePath) {
      await pool.query(
        'UPDATE events SET title = ?, description = ?, image_path = ?, event_date = ?, is_active = ? WHERE id = ?',
        [title, description, imagePath, event_date || null, is_active !== undefined ? is_active : 1, id]
      );
    } else {
      await pool.query(
        'UPDATE events SET title = ?, description = ?, event_date = ?, is_active = ? WHERE id = ?',
        [title, description, event_date || null, is_active !== undefined ? is_active : 1, id]
      );
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event (admin)
app.delete('/api/admin/events/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM events WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Get active events (for users)
app.get('/api/events', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, description, image_path, event_date, created_at FROM events WHERE is_active = 1 ORDER BY event_date DESC, created_at DESC'
    );
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

app.get('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(sanitizeUser(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [
      totalUsersResult,
      activeUsersResult, 
      balanceResult,
      productsResult,
      withdrawsResult,
      commissionResult
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM users WHERE is_admin = 0')
        .then(([rows]) => rows[0].count || 0)
        .catch(() => 0),
      pool.query(`
        SELECT COUNT(*) as count 
        FROM users 
        WHERE is_admin = 0 
        AND last_seen > NOW() - INTERVAL 5 MINUTE
      `)
        .then(([rows]) => rows[0].count || 0)
        .catch(() => 0),
      pool.query('SELECT COALESCE(SUM(wallet_balance), 0) as total FROM users WHERE is_admin = 0')
        .then(([rows]) => Number(rows[0].total) || 0)
        .catch(() => 0),
      pool.query('SELECT COUNT(*) as count FROM products')
        .then(([rows]) => rows[0].count || 0)
        .catch(() => 0),
      pool.query('SELECT COUNT(*) as count FROM withdrawal_requests WHERE status = "pending"')
        .then(([rows]) => rows[0].count || 0)
        .catch(() => 0),
      pool.query('SELECT COALESCE(SUM(commission_earned), 0) as total FROM users WHERE is_admin = 0')
        .then(([rows]) => Number(rows[0].total) || 0)
        .catch(() => 0)
    ]);

    res.json({
      totalUsers: totalUsersResult,
      activeUsers: activeUsersResult,
      totalBalance: balanceResult,
      totalProducts: productsResult,
      pendingWithdrawals: withdrawsResult,
      totalCommission: commissionResult
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.json({
      totalUsers: 0,
      activeUsers: 0,
      totalBalance: 0,
      totalProducts: 0,
      pendingWithdrawals: 0,
      totalCommission: 0
    });
  }
});

app.put('/api/admin/users/:id/balance', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { balance } = req.body;
    const userId = req.params.id;
    
    // Check if user had a negative balance trigger and admin is setting balance to 0 (clearing it)
    const [[user]] = await pool.query(
      'SELECT wallet_balance, negative_balance_triggered, balance_before_negative, negative_trigger_product_price FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    
    const currentBalance = Number(user?.wallet_balance || 0);
    const newBalance = Number(balance);
    
    // If user has negative balance AND triggered flag is set AND admin is setting to 0 → enable restoration
    if (currentBalance < 0 && 
        user?.negative_balance_triggered === 1 && 
        user?.balance_before_negative !== null && 
        newBalance === 0) {
      
      console.log(`[ADMIN] Clearing negative balance for user ${userId} - enabling balance restoration`);
      
      // Calculate the deposit amount (the absolute value of the negative balance that was cleared)
      const depositAmount = Math.abs(currentBalance);
      
      // Record the deposit in deposit history
      await pool.query(
        'INSERT INTO deposits (user_id, amount, description) VALUES (?, ?, ?)',
        [userId, depositAmount, 'Account balance deposit']
      );
      
      // Send notification to user about the deposit
      await pool.query(
        'INSERT INTO notifications (user_id, title, message, is_read) VALUES (?, ?, ?, 0)',
        [userId, '💰 Deposit Received', `You have deposited +$${depositAmount.toFixed(2)} to your account.`]
      );
      
      await pool.query(
        'UPDATE users SET wallet_balance = 0, pending_balance_restoration = 1 WHERE id = ?',
        [userId]
      );
      
      return res.json({ 
        success: true, 
        message: 'Balance cleared. User will receive original balance + 10x commission on next submission.'
      });
    }
    
    // Check if admin is adding money (increasing balance)
    if (newBalance > currentBalance) {
      const depositAmount = newBalance - currentBalance;
      
      // Record the deposit in deposit history
      await pool.query(
        'INSERT INTO deposits (user_id, amount, description) VALUES (?, ?, ?)',
        [userId, depositAmount, 'Account deposit']
      );
      
      // Send notification to user about the deposit
      await pool.query(
        'INSERT INTO notifications (user_id, title, message, is_read) VALUES (?, ?, ?, 0)',
        [userId, '💰 Deposit Received', `You have deposited +$${depositAmount.toFixed(2)} to your account.`]
      );
    }
    
    // Normal balance update
    await pool.query('UPDATE users SET wallet_balance = ? WHERE id = ?', [balance, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update balance' });
  }
});

app.put('/api/admin/users/:id/commission', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { commission } = req.body;
    await pool.query('UPDATE users SET commission_earned = ? WHERE id = ?', [commission, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update commission' });
  }
});

app.put('/api/admin/users/:id/level', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { level } = req.body;
    await pool.query('UPDATE users SET level = ? WHERE id = ?', [level, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update level' });
  }
});

app.put('/api/admin/users/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Set automatic negative balance trigger for a user
app.put('/api/admin/users/:id/negative-balance-trigger', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { setNumber, submissionNumber, amount } = req.body;
    const userId = req.params.id;
    
    // Validate inputs
    if (setNumber === null || setNumber === undefined || setNumber === '') {
      // Clear the trigger if no set number provided
      await pool.query(
        'UPDATE users SET negative_balance_set = NULL, negative_balance_submission = NULL, negative_balance_amount = NULL, negative_balance_triggered = 0 WHERE id = ?',
        [userId]
      );
      return res.json({ success: true, message: 'Negative balance trigger cleared' });
    }
    
    if (!submissionNumber || submissionNumber < 1) {
      return res.status(400).json({ error: 'Submission number must be at least 1' });
    }
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Negative balance amount must be greater than 0' });
    }
    
    // Set the trigger
    await pool.query(
      'UPDATE users SET negative_balance_set = ?, negative_balance_submission = ?, negative_balance_amount = ?, negative_balance_triggered = 0 WHERE id = ?',
      [setNumber, submissionNumber, amount, userId]
    );
    
    console.log(`[ADMIN] Set negative balance trigger for user ${userId}: Set ${setNumber}, Submission ${submissionNumber}, Amount $${amount}`);
    res.json({ 
      success: true, 
      message: `Negative balance trigger set: -$${amount} will be applied when user reaches submission ${submissionNumber} in set ${setNumber}` 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set negative balance trigger' });
  }
});

app.post('/api/admin/change-password', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    
    const userId = req.user.userId;
    const [rows] = await pool.query('SELECT password FROM users WHERE id = ? LIMIT 1', [userId]);
    
    const user = rows[0];
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

app.post('/api/admin/users/:id/reset-password', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Generate OTP for withdraw password reset (admin gives to user via customer care)
app.post('/api/admin/users/:id/withdraw-otp', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Verify user exists
    const [userRows] = await pool.query('SELECT id, username FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!userRows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Generate a 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set expiry to 15 minutes from now
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    
    // Invalidate any existing unused OTPs for this user
    await pool.query('UPDATE withdraw_password_otps SET used = 1 WHERE user_id = ? AND used = 0', [userId]);
    
    // Insert new OTP
    await pool.query(
      'INSERT INTO withdraw_password_otps (user_id, otp_code, expires_at) VALUES (?, ?, ?)',
      [userId, otpCode, expiresAt]
    );
    
    console.log(`Generated withdraw password OTP for user ${userRows[0].username}: ${otpCode}`);
    
    res.json({ 
      success: true, 
      otp: otpCode,
      expiresIn: '15 minutes',
      username: userRows[0].username
    });
  } catch (err) {
    console.error('Failed to generate withdraw OTP:', err);
    res.status(500).json({ error: 'Failed to generate OTP' });
  }
});

// Delete user account completely
app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const userId = req.params.id;
  
  try {
    console.log(`[DELETE USER] Starting deletion for user ID: ${userId}`);
    
    // Check if user exists and is not an admin
    const [userRows] = await pool.query('SELECT id, username, is_admin FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!userRows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userRows[0];
    console.log(`[DELETE USER] Found user: ${user.username}, is_admin: ${user.is_admin}`);
    
    if (user.is_admin) {
      return res.status(403).json({ error: 'Cannot delete admin accounts' });
    }
    
    // Clear referrer_id for any users who were referred by this user
    console.log(`[DELETE USER] Clearing referrer_id references...`);
    await pool.query('UPDATE users SET referrer_id = NULL WHERE referrer_id = ?', [userId]);
    
    // Delete all related data in proper order (foreign key dependencies)
    console.log(`[DELETE USER] Deleting balance_events...`);
    await pool.query('DELETE FROM balance_events WHERE user_id = ?', [userId]);
    
    console.log(`[DELETE USER] Deleting user_products...`);
    await pool.query('DELETE FROM user_products WHERE user_id = ?', [userId]);
    
    console.log(`[DELETE USER] Deleting popups...`);
    await pool.query('DELETE FROM popups WHERE user_id = ?', [userId]);
    
    console.log(`[DELETE USER] Deleting notifications...`);
    await pool.query('DELETE FROM notifications WHERE user_id = ?', [userId]);
    
    console.log(`[DELETE USER] Deleting chat_messages...`);
    await pool.query('DELETE FROM chat_messages WHERE user_id = ?', [userId]);
    
    console.log(`[DELETE USER] Deleting withdrawal_requests...`);
    await pool.query('DELETE FROM withdrawal_requests WHERE user_id = ?', [userId]);
    
    // Finally delete the user
    console.log(`[DELETE USER] Deleting user from users table...`);
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    
    console.log(`[DELETE USER] Successfully deleted user ${user.username} (ID: ${userId})`);
    res.json({ success: true, message: `User ${user.username} has been permanently deleted` });
  } catch (err) {
    console.error('[DELETE USER ERROR]', err);
    res.status(500).json({ error: 'Failed to delete user', details: err.message, sqlMessage: err.sqlMessage });
  }
});

// ========== LEVEL ICONS MANAGEMENT ==========

// Get level icon for a specific level (public endpoint)
app.get('/api/level-icons/:level', (req, res) => {
  const level = parseInt(req.params.level);
  if (isNaN(level) || level < 1 || level > 4) {
    return res.status(400).json({ error: 'Invalid level. Must be 1-4.' });
  }
  
  const levelIconsPath = path.join(UPLOAD_BASE, 'levelicons');
  
  // Try different extensions
  const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  for (const ext of extensions) {
    const filePath = path.join(levelIconsPath, `level${level}${ext}`);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  
  // Return a placeholder or 404
  res.status(404).json({ error: 'Level icon not found' });
});

// Get all level icons info (public endpoint for frontend)
app.get('/api/level-icons', (req, res) => {
  const levelIconsPath = path.join(UPLOAD_BASE, 'levelicons');
  const icons = [];
  
  for (let level = 1; level <= 5; level++) {
    const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    let found = false;
    for (const ext of extensions) {
      const filePath = path.join(levelIconsPath, `level${level}${ext}`);
      if (fs.existsSync(filePath)) {
        icons.push({
          level,
          exists: true,
          url: `/api/level-icons/${level}`
        });
        found = true;
        break;
      }
    }
    if (!found) {
      icons.push({
        level,
        exists: false,
        url: null
      });
    }
  }
  
  res.json(icons);
});

// Admin: Upload level icon
app.post('/api/admin/level-icons/:level', authMiddleware, adminMiddleware, uploadLevelIcon.single('icon'), async (req, res) => {
  try {
    const level = parseInt(req.params.level);
    if (isNaN(level) || level < 1 || level > 5) {
      return res.status(400).json({ error: 'Invalid level. Must be 1-5.' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Delete any existing icons for this level with different extensions
    const levelIconsPath = path.join(UPLOAD_BASE, 'levelicons');
    const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    for (const ext of extensions) {
      const oldFile = path.join(levelIconsPath, `level${level}${ext}`);
      if (fs.existsSync(oldFile) && oldFile !== req.file.path) {
        try {
          fs.unlinkSync(oldFile);
        } catch (e) {
          console.log('Could not delete old level icon:', e.message);
        }
      }
    }
    
    console.log(`Level ${level} icon uploaded: ${req.file.filename}`);
    
    res.json({
      success: true,
      level,
      message: `Level ${level} icon uploaded successfully`,
      url: `/api/level-icons/${level}`
    });
  } catch (err) {
    console.error('Failed to upload level icon:', err);
    res.status(500).json({ error: 'Failed to upload level icon' });
  }
});

// Admin: Delete level icon
app.delete('/api/admin/level-icons/:level', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const level = parseInt(req.params.level);
    if (isNaN(level) || level < 1 || level > 5) {
      return res.status(400).json({ error: 'Invalid level. Must be 1-5.' });
    }
    
    const levelIconsPath = path.join(UPLOAD_BASE, 'levelicons');
    const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    let deleted = false;
    
    for (const ext of extensions) {
      const filePath = path.join(levelIconsPath, `level${level}${ext}`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted = true;
      }
    }
    
    if (deleted) {
      res.json({ success: true, message: `Level ${level} icon deleted` });
    } else {
      res.status(404).json({ error: 'Level icon not found' });
    }
  } catch (err) {
    console.error('Failed to delete level icon:', err);
    res.status(500).json({ error: 'Failed to delete level icon' });
  }
});

// ========== END LEVEL ICONS MANAGEMENT ==========

// ========== CERTIFICATE IMAGE MANAGEMENT ==========

// Certificate image storage
const certificateStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(UPLOAD_BASE, 'certificates');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `certificate${ext}`);
  }
});
const uploadCertificate = multer({ storage: certificateStorage, fileFilter: imageFileFilter });

// Get certificate image (public endpoint)
app.get('/api/certificate-image', (req, res) => {
  const certPath = path.join(UPLOAD_BASE, 'certificates');
  const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  
  for (const ext of extensions) {
    const filePath = path.join(certPath, `certificate${ext}`);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  
  res.status(404).json({ error: 'No certificate image found' });
});

// Upload certificate image (admin only)
app.post('/api/admin/certificate-image', authMiddleware, adminMiddleware, uploadCertificate.single('certificate'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    
    // Delete old certificate images (different extensions)
    const certPath = path.join(UPLOAD_BASE, 'certificates');
    const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    for (const ext of extensions) {
      const oldFile = path.join(certPath, `certificate${ext}`);
      if (fs.existsSync(oldFile) && oldFile !== req.file.path) {
        try { fs.unlinkSync(oldFile); } catch(e) {}
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Certificate image uploaded successfully',
      url: '/api/certificate-image'
    });
  } catch (err) {
    console.error('Failed to upload certificate image:', err);
    res.status(500).json({ error: 'Failed to upload certificate image' });
  }
});

// ========== END CERTIFICATE IMAGE MANAGEMENT ==========

app.get('/api/admin/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/admin/vouchers', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vouchers ORDER BY id DESC');
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch vouchers' });
  }
});

app.get('/api/admin/voucher-clicks', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        p.id as popup_id,
        p.title,
        p.message,
        p.image_path,
        p.clicked_at,
        p.created_at,
        u.id as user_id,
        u.username,
        u.email
      FROM popups p
      INNER JOIN users u ON p.user_id = u.id
      WHERE p.image_path IS NOT NULL AND p.image_path != '' AND p.status = 'clicked'
      ORDER BY p.clicked_at DESC
      LIMIT 100
    `);
    console.log(`[Admin] Fetched ${rows.length} clicked vouchers`);
    res.json(rows || []);
  } catch (err) {
    console.error('Error fetching clicked vouchers:', err);
    res.status(500).json({ error: 'Failed to fetch clicked vouchers' });
  }
});

app.post('/api/admin/voucher-clicks/mark-read', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(i => Number(i)).filter(Boolean) : [];
    if (ids.length === 0) return res.json({ success: true, updated: 0 });

    const placeholders = ids.map(() => '?').join(',');
    const [result] = await pool.query(`UPDATE popups SET status = 'dismissed' WHERE id IN (${placeholders})`, ids);
    res.json({ success: true, updated: result.affectedRows || 0 });
  } catch (err) {
    console.error('Failed to mark voucher clicks as read:', err);
    res.status(500).json({ error: 'Failed to mark voucher clicks as read' });
  }
});

app.post('/api/admin/vouchers', authMiddleware, adminMiddleware, uploadVoucherMulter.single('image'), async (req, res) => {
  try {
    const { name, title, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!req.file) return res.status(400).json({ error: 'Image required' });
    const image_path = '/backend/uploads/vouchers/' + req.file.filename;
    const [result] = await pool.query(
      'INSERT INTO vouchers (name, title, description, image_path, status) VALUES (?, ?, ?, ?, "active")',
      [name, title || null, description || null, image_path]
    );
    const [rows] = await pool.query('SELECT * FROM vouchers WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Voucher upload error:', err);
    res.status(500).json({ error: 'Failed to upload voucher: ' + (err && err.message ? err.message : 'unknown error') });
  }
});

app.post('/api/admin/products', authMiddleware, adminMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;
    const level1Price = parseFloat(req.body.level1Price);
    const level2Price = parseFloat(req.body.level2Price);
    const level3Price = parseFloat(req.body.level3Price);
    const level4Price = parseFloat(req.body.level4Price);
    const level5Price = parseFloat(req.body.level5Price);
    const level1Commission = parseFloat(req.body.level1Commission) || 0;
    const level2Commission = parseFloat(req.body.level2Commission) || 0;
    const level3Commission = parseFloat(req.body.level3Commission) || 0;
    const level4Commission = parseFloat(req.body.level4Commission) || 0;
    const level5Commission = parseFloat(req.body.level5Commission) || 0;
    if (!req.file) return res.status(400).json({ error: 'Image required' });
    const image_path = '/backend/uploads/products/' + req.file.filename;
    const [result] = await pool.query(
      'INSERT INTO products (name, image_path, level1_price, level2_price, level3_price, level4_price, level5_price, level1_commission, level2_commission, level3_commission, level4_commission, level5_commission) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
      [name, image_path, level1Price, level2Price, level3Price, level4Price, level5Price, level1Commission, level2Commission, level3Commission, level4Commission, level5Commission]
    );
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Product upload failed' });
  }
});

app.put('/api/admin/products/:id', authMiddleware, adminMiddleware, upload.single('image'), async (req, res) => {
  try {
    const id = req.params.id;
    const { name } = req.body;
    const level1Price = parseFloat(req.body.level1Price);
    const level2Price = parseFloat(req.body.level2Price);
    const level3Price = parseFloat(req.body.level3Price);
    const level4Price = parseFloat(req.body.level4Price);
    const level5Price = parseFloat(req.body.level5Price);
    let image_path = null;
    if (req.file) {
      image_path = '/backend/uploads/products/' + req.file.filename;
    }
    const updates = [];
    const params = [];
    if (name) { updates.push('name = ?'); params.push(name); }
    if (image_path) { updates.push('image_path = ?'); params.push(image_path); }
    if (!isNaN(level1Price)) { updates.push('level1_price = ?'); params.push(level1Price); }
    if (!isNaN(level2Price)) { updates.push('level2_price = ?'); params.push(level2Price); }
    if (!isNaN(level3Price)) { updates.push('level3_price = ?'); params.push(level3Price); }
    if (!isNaN(level4Price)) { updates.push('level4_price = ?'); params.push(level4Price); }
    if (!isNaN(level5Price)) { updates.push('level5_price = ?'); params.push(level5Price); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(id);
    await pool.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params);
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.put('/api/admin/products/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await pool.query('SELECT status FROM products WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const newStatus = rows[0].status === 'active' ? 'inactive' : 'active';
    await pool.query('UPDATE products SET status = ? WHERE id = ?', [newStatus, id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to toggle product status' });
  }
});

app.delete('/api/admin/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    
    // Check if product exists
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    
    const product = rows[0];
    
    // Delete associated user_products entries first (foreign key constraint)
    await pool.query('DELETE FROM user_products WHERE product_id = ?', [id]);
    
    // Delete the product
    await pool.query('DELETE FROM products WHERE id = ?', [id]);
    
    // Optionally delete the image file from disk
    if (product.image_path) {
      try {
        const imagePath = path.join(__dirname, '..', product.image_path.replace(/^\//, ''));
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
          console.log(`Deleted image file: ${imagePath}`);
        }
      } catch (fileErr) {
        console.error('Failed to delete image file:', fileErr);
        // Continue anyway - product is deleted from DB
      }
    }
    
    res.json({ success: true, message: 'Product permanently deleted' });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Failed to delete product: ' + err.message });
  }
});

// Get all withdrawal requests for admin
app.get('/api/admin/withdrawals', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('🟡 ADMIN API: Fetching withdrawals...');
    const [rows] = await pool.query(`
      SELECT 
        wr.id,
        wr.user_id,
        wr.username,
        wr.amount,
        wr.wallet_address,
        wr.withdraw_type,
        wr.status,
        wr.admin_note,
        wr.requested_at,
        wr.processed_at,
        u.wallet_balance as user_balance,
        u.withdraw_type as user_withdraw_type,
        u.saved_wallet_address as user_saved_wallet
      FROM withdrawal_requests wr
      LEFT JOIN users u ON wr.user_id = u.id
      ORDER BY wr.requested_at DESC
    `);
    console.log('🟡 ADMIN API: Found', rows.length, 'withdrawal requests');
    if (rows.length > 0) {
      console.log('🟡 ADMIN API: Sample (first request):', {
        id: rows[0].id,
        username: rows[0].username,
        amount: rows[0].amount,
        status: rows[0].status
      });
    }
    res.json(rows || []);
  } catch (err) {
    console.error('🟡 ADMIN API ERROR - Failed to fetch withdrawal requests:', err.message);
    console.error('🟡 ADMIN API ERROR - Full error:', err);
    res.status(500).json({ error: 'Failed to fetch withdrawals: ' + err.message });
  }
});

// Approve withdrawal request
app.put('/api/admin/withdrawals/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { admin_note } = req.body;
    
    const [rows] = await pool.query('SELECT * FROM withdrawal_requests WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }
    
    const withdrawal = rows[0];
    
    // If status is pending, deduct balance now (if not already deducted)
    if (withdrawal.status === 'pending') {
      // Verify user still has sufficient commission_earned (withdrawals come from commission)
      const [userRows] = await pool.query('SELECT wallet_balance, commission_earned FROM users WHERE id = ? LIMIT 1', [withdrawal.user_id]);
      if (userRows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const commissionEarned = Number(userRows[0].commission_earned) || 0;
      if (commissionEarned < Number(withdrawal.amount)) {
        return res.status(400).json({ error: 'User has insufficient commission earned for this withdrawal' });
      }
      
      // Deduct from BOTH wallet_balance AND commission_earned
      // (commission is added to wallet_balance during submission, so both must be reduced on withdrawal)
      await pool.query(
        'UPDATE users SET wallet_balance = wallet_balance - ?, commission_earned = commission_earned - ? WHERE id = ?',
        [Number(withdrawal.amount), Number(withdrawal.amount), withdrawal.user_id]
      );
    }
    
    // Update withdrawal status
    await pool.query(
      'UPDATE withdrawal_requests SET status = ?, admin_note = ?, processed_at = NOW() WHERE id = ?',
      ['approved', admin_note || 'Approved by admin', id]
    );
    
    res.json({ success: true, message: 'Withdrawal approved successfully' });
  } catch (err) {
    console.error('Failed to approve withdrawal:', err);
    res.status(500).json({ error: 'Failed to approve withdrawal: ' + err.message });
  }
});

// Reject withdrawal request
app.put('/api/admin/withdrawals/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { admin_note } = req.body;
    
    // Get withdrawal details to restore balance if needed
    const [rows] = await pool.query('SELECT * FROM withdrawal_requests WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }
    
    const withdrawal = rows[0];
    
    // Only restore balance if withdrawal was previously approved (balance was deducted)
    if (withdrawal.status === 'approved') {
      // Restore BOTH wallet_balance AND commission_earned
      await pool.query(
        'UPDATE users SET wallet_balance = wallet_balance + ?, commission_earned = commission_earned + ? WHERE id = ?',
        [withdrawal.amount, withdrawal.amount, withdrawal.user_id]
      );
    }
    // If status is pending, balance was never deducted, so no need to restore
    
    // Update withdrawal status
    await pool.query(
      'UPDATE withdrawal_requests SET status = ?, admin_note = ?, processed_at = NOW() WHERE id = ?',
      ['rejected', admin_note || 'Rejected by admin', id]
    );
    
    const message = withdrawal.status === 'approved' 
      ? 'Withdrawal rejected successfully and balance restored'
      : 'Withdrawal rejected successfully';
    
    res.json({ success: true, message });
  } catch (err) {
    console.error('Failed to reject withdrawal:', err);
    res.status(500).json({ error: 'Failed to reject withdrawal: ' + err.message });
  }
});

// Set withdrawal to pending
app.put('/api/admin/withdrawals/:id/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { admin_note } = req.body;
    
    // Get current withdrawal status to determine if balance needs adjustment
    const [rows] = await pool.query('SELECT * FROM withdrawal_requests WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }
    
    const withdrawal = rows[0];
    
    // If changing from approved to pending, restore balance
    // (balance was deducted when approved, now needs to be returned)
    if (withdrawal.status === 'approved') {
      // Restore BOTH wallet_balance AND commission_earned
      await pool.query(
        'UPDATE users SET wallet_balance = wallet_balance + ?, commission_earned = commission_earned + ? WHERE id = ?',
        [withdrawal.amount, withdrawal.amount, withdrawal.user_id]
      );
    }
    
    // If changing from rejected to pending, no balance change needed
    // (balance was never deducted from pending, or was already restored from approved)
    
    // Update withdrawal status
    await pool.query(
      'UPDATE withdrawal_requests SET status = ?, admin_note = ?, processed_at = NOW() WHERE id = ?',
      ['pending', admin_note || 'Set to pending by admin', id]
    );
    
    const message = withdrawal.status === 'approved'
      ? 'Withdrawal set to pending and balance restored'
      : 'Withdrawal set to pending';
    
    res.json({ success: true, message });
  } catch (err) {
    console.error('Failed to update withdrawal:', err);
    res.status(500).json({ error: 'Failed to update withdrawal status: ' + err.message });
  }
});

app.get('/api/admin/commission-rates', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM commission_rates ORDER BY level');
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch commission rates' });
  }
});

app.put('/api/admin/commission-rates', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { rates } = req.body;
    if (!Array.isArray(rates)) return res.status(400).json({ error: 'Invalid rates' });
    const promises = rates.map(r => pool.query('REPLACE INTO commission_rates (level, rate) VALUES (?, ?)', [r.level, r.rate]));
    await Promise.all(promises);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update rates' });
  }
});

app.get('/api/admin/level-settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM level_settings ORDER BY level');
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch level settings' });
  }
});

app.get('/api/admin/negative-balances', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, wallet_balance FROM users WHERE wallet_balance < 0 ORDER BY wallet_balance ASC LIMIT 500');
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch negative balances' });
  }
});

app.get('/api/admin/balance-events', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = req.query.userId;
    let rows;
    if (userId) {
      [rows] = await pool.query('SELECT * FROM balance_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 1000', [userId]);
    } else {
      [rows] = await pool.query('SELECT * FROM balance_events ORDER BY created_at DESC LIMIT 1000');
    }
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch balance events' });
  }
});

app.put('/api/admin/level-settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!Array.isArray(settings)) return res.status(400).json({ error: 'Invalid settings' });
    const promises = settings.map(s => pool.query('REPLACE INTO level_settings (level, daily_task_limit, total_tasks_required, min_withdrawal_balance, max_withdrawal_amount) VALUES (?, ?, ?, ?, ?)', [s.level, s.daily_task_limit, s.total_tasks_required, s.min_withdrawal_balance, s.max_withdrawal_amount]));
    await Promise.all(promises);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update level settings' });
  }
});

app.post('/api/admin/create-admin', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, email, password, is_admin) VALUES (?, ?, ?, ?)', [username, email, hashed, true]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

// Reset user's daily tasks (allows them to continue to Set 2)
app.post('/api/admin/reset-user-tasks', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    
    // Get current user state
    const [[user]] = await pool.query('SELECT level, current_set, tasks_completed_today FROM users WHERE id = ? LIMIT 1', [userId]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get level-based task limits
    const taskLimits = getTaskLimitsForLevel(user.level || 1);
    const tasksPerSet = taskLimits.perSet;
    const totalTasks = taskLimits.total;
    
    // If user completed a set, reset their task count to 0 and move them to the next set
    const currentSet = user.current_set || 1;
    let newSet = currentSet + 1;
    if (newSet > 3) newSet = 3; // Cap at Set 3
    
    console.log('[RESET TASKS] Resetting user', userId, 'from Set', currentSet, 'to Set', newSet, 'with tasks_completed_today = 0');
    
    // Reset tasks_completed_today to 0 and move to next set
    // This ensures the count starts fresh for the next set
    await pool.query(
      'UPDATE users SET current_set = ?, tasks_completed_today = 0 WHERE id = ?',
      [newSet, userId]
    );
    
    console.log('[RESET TASKS] Successfully reset - current_set:', newSet, 'tasks_completed_today: 0');
    
    // Notify user
    await pool.query(
      'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
      [userId, 'Tasks Reset', `Your tasks have been reset by admin. You can now continue to Set ${newSet} (${tasksPerSet} more tasks)!`]
    );
    
    res.json({ success: true, message: `User task count reset to 0 and moved to Set ${newSet}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset tasks' });
  }
});

// Generate invite code for a user (admin can create codes)
app.post('/api/admin/generate-invite-code', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, forceRegenerate } = req.body;
    
    if (userId) {
      // Generate for specific user
      const [userRows] = await pool.query('SELECT invite_code FROM users WHERE id = ? LIMIT 1', [userId]);
      if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
      
      if (!userRows[0].invite_code || forceRegenerate) {
        const newCode = await generateUniqueInviteCode();
        await pool.query('UPDATE users SET invite_code = ? WHERE id = ?', [newCode, userId]);
        res.json({ success: true, inviteCode: newCode });
      } else {
        res.json({ success: true, inviteCode: userRows[0].invite_code });
      }
    } else {
      // Generate standalone code (can be used to create admin invite codes)
      const newCode = await generateUniqueInviteCode();
      res.json({ success: true, inviteCode: newCode });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate invite code' });
  }
});

// Set a custom invite code for a user (admin only)
app.post('/api/admin/set-invite-code', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, inviteCode } = req.body;
    if (!userId || !inviteCode) return res.status(400).json({ error: 'User ID and invite code are required' });
    
    // Validate code format (2-20 chars, alphanumeric)
    const code = inviteCode.trim().toUpperCase();
    if (code.length < 2 || code.length > 20 || !/^[A-Z0-9]+$/.test(code)) {
      return res.status(400).json({ error: 'Invite code must be 2-20 alphanumeric characters' });
    }
    
    // Check if code already exists for another user
    const [existing] = await pool.query('SELECT id FROM users WHERE invite_code = ? AND id != ? LIMIT 1', [code, userId]);
    if (existing.length > 0) return res.status(400).json({ error: 'This invite code is already in use by another user' });
    
    await pool.query('UPDATE users SET invite_code = ? WHERE id = ?', [code, userId]);
    res.json({ success: true, inviteCode: code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set invite code' });
  }
});

app.post('/api/admin/trigger-assignment', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await assignProductsToAllUsers();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Assignment failed' });
  }
});

app.post('/api/admin/assign-products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { productIds } = req.body;
    console.log('[TRIGGER ASSIGNMENT] Received request with productIds:', productIds);
    
    if (!Array.isArray(productIds) || productIds.length === 0) {
      console.log('[TRIGGER ASSIGNMENT] Error: No products selected');
      return res.status(400).json({ error: 'No products selected' });
    }
    
    console.log('[TRIGGER ASSIGNMENT] Starting assignment process...');
    const result = await assignProductsToAllUsers(productIds);
    console.log('[TRIGGER ASSIGNMENT] Assignment completed:', result);
    
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[TRIGGER ASSIGNMENT ERROR]', err);
    res.status(500).json({ error: err.message || 'Assignment failed' });
  }
});

app.post('/api/admin/assign-product-to-user', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, productId, manualBonus, customPrice } = req.body;
    if (!userId || !productId) {
      return res.status(400).json({ error: 'Missing user or product' });
    }

    const bonusRaw = Number(manualBonus || 0);
    const bonus = !isNaN(bonusRaw) && bonusRaw > 0 ? Number(bonusRaw.toFixed(2)) : 0;

    const [[userRow]] = await pool.query('SELECT id, level FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!userRow) return res.status(404).json({ error: 'User not found' });

    const [[productRow]] = await pool.query('SELECT * FROM products WHERE id = ? LIMIT 1', [productId]);
    if (!productRow || productRow.status !== 'active') return res.status(404).json({ error: 'Product not available' });

    let price;
    let priceToUse = null;
    if (customPrice !== undefined && customPrice !== null && customPrice !== '') {
      const customPriceNum = Number(customPrice);
      if (isNaN(customPriceNum) || customPriceNum < 0) {
        return res.status(400).json({ error: 'Invalid custom price' });
      }
      price = customPriceNum;
      priceToUse = price;
    } else {
      const priceColumn = 'level' + (userRow.level || 1) + '_price';
      price = Number(productRow[priceColumn] || productRow.level1_price || 0);
      if (!(price > 0)) {
        return res.status(400).json({ error: 'Invalid product price for this user level' });
      }
    }
    
    // Get current balance before assignment
    const [[currentUser]] = await pool.query('SELECT wallet_balance FROM users WHERE id = ? LIMIT 1', [userId]);
    const currentBalance = Number(currentUser.wallet_balance || 0);
    
    console.log(`[MANUAL ASSIGN] User ${userId}: Assigning ${productRow.name}`);
    console.log(`[MANUAL ASSIGN] Product price: $${price}`);
    console.log(`[MANUAL ASSIGN] Current balance: $${currentBalance}`);

    const [existingRows] = await pool.query('SELECT id, custom_price, status FROM user_products WHERE user_id = ? AND product_id = ? AND DATE(assigned_date) = CURDATE() LIMIT 1', [userId, productId]);
    let amountToDeduct = price; // Amount to deduct from balance
    let isUpdate = false;
    
    if (existingRows.length > 0) {
      // Found existing assignment for this product today
      const existing = existingRows[0];
      const previousCustomPrice = existing.custom_price !== null ? Number(existing.custom_price) : null;
      const previousPrice = previousCustomPrice !== null ? previousCustomPrice : Number(productRow['level' + (userRow.level || 1) + '_price'] || productRow.level1_price || 0);
      
      if (existing.status === 'completed') {
        // Product was already completed today - reset it to in_progress with new price
        // Since we're deducting balance now, it should be ready to submit (in_progress)
        console.log(`[MANUAL ASSIGN] Product was completed today. Resetting to in_progress with new price: $${price}`);
        console.log(`[MANUAL ASSIGN] Previous price was: $${previousPrice}`);
        amountToDeduct = price; // Deduct full new price (previous was already credited on submission)
        await pool.query('UPDATE user_products SET status = ?, manual_bonus = ?, custom_price = ?, is_manual = 1, amount_earned = 0, commission_earned = 0, submitted_at = NULL, balance_before_start = ? WHERE id = ?', ['in_progress', bonus, priceToUse, currentBalance, existing.id]);
      } else {
        // Updating existing pending/in_progress assignment - adjust for price difference
        isUpdate = true;
        // Calculate net change: refund previous, deduct new
        // If previous was $10k and new is $4k: net adjustment is $4k - $10k = -$6k (refund $6k)
        amountToDeduct = Number((price - previousPrice).toFixed(2));
        
        console.log(`[MANUAL ASSIGN] Updating existing assignment. Previous price: $${previousPrice}, New price: $${price}`);
        console.log(`[MANUAL ASSIGN] Net adjustment: ${amountToDeduct >= 0 ? 'Deduct' : 'Refund'} $${Math.abs(amountToDeduct)}`);
        await pool.query('UPDATE user_products SET status = ?, manual_bonus = ?, custom_price = ?, is_manual = 1, assigned_date = CURDATE(), amount_earned = 0, commission_earned = 0, submitted_at = NULL, balance_before_start = ? WHERE id = ?', ['in_progress', bonus, priceToUse, currentBalance, existing.id]);
      }
    } else {
      // New assignment - no existing record
      // Set to in_progress since balance is deducted at assignment for manual products
      console.log(`[MANUAL ASSIGN] New assignment. Deducting: $${amountToDeduct}`);
      await pool.query('INSERT INTO user_products (user_id, product_id, assigned_date, status, manual_bonus, custom_price, is_manual, balance_before_start) VALUES (?, ?, CURDATE(), ?, ?, ?, 1, ?)', [userId, productId, 'in_progress', bonus, priceToUse, currentBalance]);
    }

    // Skip deduction if amount is negligible
    if (Math.abs(amountToDeduct) < 0.005) {
      console.log(`[MANUAL ASSIGN] Amount too small, skipping adjustment`);
      amountToDeduct = 0;
    }

    let newBalance = currentBalance;
    
    // Perform balance adjustment
    if (amountToDeduct !== 0) {
      // Always subtract the amount (positive = deduct, negative = refund via subtraction of negative)
      await pool.query('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [amountToDeduct, userId]);
      
      newBalance = Number((currentBalance - amountToDeduct).toFixed(2));
      console.log(`[MANUAL ASSIGN] Balance: $${currentBalance} → $${newBalance}`);
      
      // Record event with proper sign
      if (amountToDeduct > 0) {
        await pool.query('INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "assignment_debit", ?, CURDATE(), ?)', [userId, amountToDeduct, `Manual assignment of ${productRow.name} - Product cost deducted`]);
      } else {
        await pool.query('INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "assignment_refund", ?, CURDATE(), ?)', [userId, Math.abs(amountToDeduct), `Refund from updating ${productRow.name} assignment`]);
      }
    } else {
      console.log(`[MANUAL ASSIGN] No balance adjustment needed`);
    }

    res.json({ 
      success: true,
      newBalance: newBalance,
      balanceIsNegative: newBalance < 0,
      productName: productRow.name,
      productPrice: price
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Manual assignment failed' });
  }
});

// ==================== BRANDING IMAGES API ====================

// Get all branding images (public)
app.get('/api/branding-images', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_key, image_path, updated_at FROM branding_images');
    const result = {};
    rows.forEach(r => { result[r.image_key] = r.image_path; });
    res.json(result);
  } catch (err) {
    console.error('Get branding images error:', err);
    res.status(500).json({ error: 'Failed to get branding images' });
  }
});

// Get a single branding image by key (serves the actual file)
app.get('/api/branding-images/:key', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_path FROM branding_images WHERE image_key = ? LIMIT 1', [req.params.key]);
    if (rows.length === 0) return res.status(404).json({ error: 'Branding image not found' });
    const filePath = path.join(__dirname, '..', rows[0].image_path.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
    // Fallback: try from uploads directly
    const altPath = path.join(UPLOAD_BASE, 'logos', path.basename(rows[0].image_path));
    if (fs.existsSync(altPath)) {
      return res.sendFile(altPath);
    }
    res.status(404).json({ error: 'Image file not found on disk' });
  } catch (err) {
    console.error('Get branding image error:', err);
    res.status(500).json({ error: 'Failed to get branding image' });
  }
});

// Admin: Upload/update a branding image
app.post('/api/admin/branding-images/:key', authMiddleware, adminMiddleware, uploadBranding.single('image'), async (req, res) => {
  try {
    const key = req.params.key;
    const validKeys = ['logo', 'back', 'land'];
    if (!validKeys.includes(key)) return res.status(400).json({ error: 'Invalid image key. Must be one of: ' + validKeys.join(', ') });
    if (!req.file) return res.status(400).json({ error: 'Image file required' });
    
    const image_path = '/backend/uploads/logos/' + req.file.filename;
    
    // Upsert: insert or update
    await pool.query(
      'INSERT INTO branding_images (image_key, image_path) VALUES (?, ?) ON DUPLICATE KEY UPDATE image_path = ?, updated_at = CURRENT_TIMESTAMP',
      [key, image_path, image_path]
    );
    
    res.json({ success: true, key, image_path });
  } catch (err) {
    console.error('Upload branding image error:', err);
    res.status(500).json({ error: 'Failed to upload branding image' });
  }
});

// Admin: Delete a branding image
app.delete('/api/admin/branding-images/:key', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const key = req.params.key;
    const [rows] = await pool.query('SELECT image_path FROM branding_images WHERE image_key = ? LIMIT 1', [key]);
    if (rows.length > 0 && rows[0].image_path) {
      const filePath = path.join(__dirname, '..', rows[0].image_path.replace(/^\//, ''));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    await pool.query('DELETE FROM branding_images WHERE image_key = ?', [key]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete branding image error:', err);
    res.status(500).json({ error: 'Failed to delete branding image' });
  }
});

// Admin: Get all branding images (admin view)
app.get('/api/admin/branding-images', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM branding_images ORDER BY image_key');
    res.json(rows);
  } catch (err) {
    console.error('Admin get branding images error:', err);
    res.status(500).json({ error: 'Failed to get branding images' });
  }
});

// Serve root HTML files from the static root (project root)
app.get('/', (req, res) => {
  res.sendFile(path.join(STATIC_ROOT, 'index.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(STATIC_ROOT, 'admin.html'));
});

// Fallback: serve index.html for any non-API, non-static, non-upload route so
// client-side routing works when the frontend is served by this Express app.
app.get('*', (req, res, next) => {
  // allow API and uploads to continue to their routes
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/static')) {
    return next();
  }
  // Only serve index.html for GET requests
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(STATIC_ROOT, 'index.html'));
});

async function ensureDefaultAdmin() {
  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE username = ? AND is_admin = 1 LIMIT 1', ['admin']);
    if (rows.length === 0) {
      const defaultPassword = 'admin123';
      const hashed = await bcrypt.hash(defaultPassword, 10);
      await pool.query(
        'INSERT INTO users (username, email, password, is_admin, status) VALUES (?, ?, ?, ?, ?)',
        ['admin', 'admin@wunderkind.com', hashed, true, 'active']
      );
      console.log('✅ Default admin user created:');
      console.log('   Username: admin');
      console.log('   Password: admin123');
      console.log('   ⚠️  Please change the password after first login!');
    } else {
      console.log('✅ Admin user already exists');
    }
  } catch (err) {
    console.error('❌ Error creating default admin:', err.message);
  }
}

// Global error handler for multer and other errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  } else if (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
  next();
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 API Health check: /api/health (port ${PORT})`);
  console.log(`👤 User interface: /`);
  console.log(`🔧 Admin interface: /admin.html`);
  
  const dbConnected = await testConnection();
  if (dbConnected) {
    await ensureSchema();
    await ensureDefaultAdmin();
    
    // Schedule automatic daily product assignment at midnight (00:00)
    cron.schedule('0 0 * * *', async () => {
      console.log('[CRON] Running automatic daily product assignment...');
      try {
        const result = await assignProductsToAllUsers(null);
        console.log(`[CRON] Daily assignment complete: ${result.usersAssigned} users, ${result.assignments} total assignments`);
      } catch (err) {
        console.error('[CRON] Daily assignment failed:', err.message);
      }
    }, {
      timezone: 'UTC'
    });
    console.log('⏰ Cron job scheduled: Daily product assignment at midnight UTC');
  } else {
    console.error('⚠️  Server started but database is not connected!');
    console.error('⚠️  Check your database configuration and restart the server.');
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    
    // Auto-generate invite code if user doesn't have one
    const user = rows[0];
    if (!user.invite_code) {
      const newCode = await generateUniqueInviteCode();
      await pool.query('UPDATE users SET invite_code = ? WHERE id = ?', [newCode, user.id]);
      user.invite_code = newCode;
    }
    
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ----------------------
// User routes
// ----------------------

app.get('/api/user/dashboard', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const userId = req.user.userId;
    const [userRow] = await conn.query('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
    if (userRow.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRow[0];

    const [levelSettingsRows] = await conn.query('SELECT * FROM level_settings WHERE level = ? LIMIT 1', [user.level]);

    const [commissionRows] = await conn.query('SELECT rate FROM commission_rates WHERE level = ? LIMIT 1', [user.level]);
    const commissionRate = commissionRows.length ? commissionRows[0].rate : 0.05;

    const [todayProductsRows] = await conn.query(
      `SELECT 
         up.id AS assignment_id,
         up.status,
         up.amount_earned,
         up.commission_earned,
         up.manual_bonus,
         up.custom_price,
         up.is_manual,
         up.assigned_date,
         up.submitted_at,
         p.id AS product_id,
         p.name,
         p.image_path,
         p.level1_price,
         p.level2_price,
         p.level3_price,
         p.level4_price,
         p.level5_price
       FROM user_products up
       JOIN products p ON up.product_id = p.id
       WHERE up.user_id = ? AND DATE(up.assigned_date) = CURDATE()
       ORDER BY 
         CASE WHEN up.status = 'pending' THEN 0 ELSE 1 END,
         up.id ASC`,
      [userId]
    );

    const todayProducts = todayProductsRows.map(sanitizeUserProduct);
    const completedToday = todayProducts.filter(product => product.status === 'completed').length;
    // For Tasks view, only show pending products
    const pendingProducts = todayProducts.filter(product => product.status !== 'completed');

    // Deduction now happens automatically at assignment time, not when viewing dashboard

    const canUpgrade = user.tasks_completed_at_level >= (levelSettingsRows[0]?.total_tasks_required || 999999);

    await conn.commit();

    const sanitizedUser = sanitizeUser(user);
    console.log('[DASHBOARD] Sending user data - userId:', userId, 'current_set:', sanitizedUser.current_set, 'tasks_completed_today:', sanitizedUser.tasks_completed_today);

    res.json({
      user: sanitizedUser,
      levelSettings: levelSettingsRows[0] || {},
      commissionRate,
      todayProducts: pendingProducts, // Only show pending products in Tasks view
      completedToday,
      canUpgrade
    });
  } catch (err) {
    await conn.rollback();
    console.error('[DASHBOARD ERROR]', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  } finally {
    conn.release();
  }
});

app.get('/api/user/popups', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await pool.query(
      'SELECT id, title, message, url, image_path, status, created_at FROM popups WHERE user_id = ? AND status = "pending" ORDER BY created_at DESC LIMIT 3',
      [userId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch popups' });
  }
});

app.post('/api/user/popup/:id/click', authMiddleware, async (req, res) => {
  try {
    const popupId = req.params.id;
    const userId = req.user.userId;
    const [rows] = await pool.query('SELECT id, user_id, image_path, title FROM popups WHERE id = ? LIMIT 1', [popupId]);
    if (!rows.length) return res.status(404).json({ error: 'Popup not found' });
    if (rows[0].user_id !== userId) return res.status(403).json({ error: 'Not allowed' });
    
    await pool.query('UPDATE popups SET status = "clicked", clicked_at = NOW() WHERE id = ?', [popupId]);
    
    if (rows[0].image_path && rows[0].image_path.trim() !== '') {
      try {
        const [userRows] = await pool.query('SELECT username, email FROM users WHERE id = ?', [userId]);
        const userInfo = userRows[0] || {};
        const userName = userInfo.username || userInfo.email || `User #${userId}`;
        
        console.log(`[ADMIN NOTIFICATION] ✅ User ${userName} (ID: ${userId}) clicked on voucher popup (ID: ${popupId}, Title: ${rows[0].title || 'N/A'})`);
        console.log(`[ADMIN NOTIFICATION] Voucher image path: ${rows[0].image_path}`);
        
        // Create notification for admin users
        const [adminUsers] = await pool.query('SELECT id FROM users WHERE is_admin = 1');
        for (const admin of adminUsers) {
          await pool.query(
            'INSERT INTO notifications (user_id, title, message, is_read) VALUES (?, ?, ?, 0)',
            [
              admin.id,
              '🎁 Voucher Claimed',
              `${userName} claimed voucher: ${rows[0].title || 'Untitled'}`
            ]
          );
        }
      } catch (notifyErr) {
        console.error('Failed to notify admin:', notifyErr);
      }
    }
    
    res.json({ success: true, isVoucher: !!(rows[0].image_path && rows[0].image_path.trim() !== '') });
  } catch (err) {
    console.error('Error recording popup click:', err);
    res.status(500).json({ error: 'Failed to record click' });
  }
});

app.post('/api/user/popup/:id/dismiss', authMiddleware, async (req, res) => {
  try {
    const popupId = req.params.id;
    const userId = req.user.userId;
    const [rows] = await pool.query('SELECT id, user_id FROM popups WHERE id = ? LIMIT 1', [popupId]);
    if (!rows.length) return res.status(404).json({ error: 'Popup not found' });
    if (rows[0].user_id !== userId) return res.status(403).json({ error: 'Not allowed' });
    
    await pool.query('UPDATE popups SET status = "dismissed" WHERE id = ?', [popupId]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error dismissing popup:', err);
    res.status(500).json({ error: 'Failed to dismiss popup' });
  }
});

app.get('/api/user/notifications', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await pool.query(
      'SELECT id, title, message, is_read, created_at FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 20',
      [userId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.patch('/api/user/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    const noteId = req.params.id;
    const userId = req.user.userId;
    const [rows] = await pool.query('SELECT id, user_id FROM notifications WHERE id = ? LIMIT 1', [noteId]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].user_id !== userId) return res.status(403).json({ error: 'Not allowed' });
    await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ?', [noteId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// ==================== CHAT SYSTEM ====================

// User: Send a message to admin
app.post('/api/user/chat/send', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { message } = req.body;
    
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }
    
    console.log(`[CHAT] User ${userId} sending message: "${message.trim()}"`);
    
    const [result] = await pool.query(
      'INSERT INTO chat_messages (user_id, message, sender_type, is_read, created_at) VALUES (?, ?, ?, ?, NOW())',
      [userId, message.trim(), 'user', 0]
    );
    
    console.log(`[CHAT] Message saved with ID: ${result.insertId}`);
    
    res.json({ 
      success: true, 
      messageId: result.insertId,
      message: 'Message sent successfully'
    });
  } catch (err) {
    console.error('[CHAT] Send error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// User: Get chat history
app.get('/api/user/chat/messages', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const [messages] = await pool.query(
      'SELECT id, message, sender_type, is_read, image_path, created_at FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC',
      [userId]
    );
    
    // Mark admin messages as read
    await pool.query(
      'UPDATE chat_messages SET is_read = 1 WHERE user_id = ? AND sender_type = ? AND is_read = 0',
      [userId, 'admin']
    );
    
    res.json(messages || []);
  } catch (err) {
    console.error('Chat fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// User: Get unread message count
app.get('/api/user/chat/unread-count', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) as count FROM chat_messages WHERE user_id = ? AND sender_type = ? AND is_read = 0',
      [userId, 'admin']
    );
    
    res.json({ unreadCount: count || 0 });
  } catch (err) {
    console.error('Chat unread count error:', err);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// User: Send chat message with image
app.post('/api/user/chat/send-image', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const message = req.body.message || '';
    const imageFile = req.file;
    
    console.log('[CHAT IMAGE] Request received from user:', userId);
    console.log('[CHAT IMAGE] Message:', message);
    console.log('[CHAT IMAGE] File:', imageFile ? imageFile.originalname : 'none');
    
    if (!imageFile && !message.trim()) {
      return res.status(400).json({ error: 'Message or image is required' });
    }
    
    let imagePath = null;
    if (imageFile) {
      try {
        // Move file to chat uploads folder
        const chatDir = path.join(__dirname, 'uploads', 'chat');
        if (!fs.existsSync(chatDir)) {
          console.log('[CHAT IMAGE] Creating chat directory:', chatDir);
          fs.mkdirSync(chatDir, { recursive: true });
        }
        
        const filename = `${Date.now()}-${imageFile.originalname}`;
        const destination = path.join(chatDir, filename);
        
        console.log('[CHAT IMAGE] Moving file from:', imageFile.path);
        console.log('[CHAT IMAGE] Moving file to:', destination);
        
        fs.renameSync(imageFile.path, destination);
        imagePath = `uploads/chat/${filename}`;
        
        console.log('[CHAT IMAGE] File moved successfully, path:', imagePath);
      } catch (fileErr) {
        console.error('[CHAT IMAGE] File handling error:', fileErr);
        throw new Error('Failed to save image: ' + fileErr.message);
      }
    }
    
    console.log(`[CHAT] User ${userId} sending message with image: "${message.trim()}", image: ${imagePath}`);
    
    const [result] = await pool.query(
      'INSERT INTO chat_messages (user_id, message, sender_type, is_read, image_path, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [userId, message.trim(), 'user', 0, imagePath]
    );
    
    console.log(`[CHAT] Message saved with ID: ${result.insertId}`);
    
    res.json({ 
      success: true, 
      messageId: result.insertId,
      message: 'Message sent successfully',
      imagePath: imagePath
    });
  } catch (err) {
    console.error('[CHAT] Send image error:', err);
    res.status(500).json({ error: 'Failed to send message: ' + err.message });
  }
});

// Admin: Get all users with messages (chat list)
app.get('/api/admin/chat/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('[CHAT] Admin requesting chat users list');
    
    const [users] = await pool.query(`
      SELECT 
        u.id, 
        u.username, 
        u.email,
        COUNT(CASE WHEN cm.sender_type = 'user' AND cm.is_read = 0 THEN 1 END) as unread_count,
        MAX(cm.created_at) as last_message_time
      FROM users u
      INNER JOIN chat_messages cm ON u.id = cm.user_id
      GROUP BY u.id, u.username, u.email
      ORDER BY last_message_time DESC
    `);
    
    console.log(`[CHAT] Found ${users.length} users with messages`);
    
    res.json(users || []);
  } catch (err) {
    console.error('[CHAT] Admin chat users error:', err);
    res.status(500).json({ error: 'Failed to fetch chat users' });
  }
});

// Admin: Get messages for a specific user
app.get('/api/admin/chat/messages/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const [messages] = await pool.query(
      'SELECT id, message, sender_type, is_read, image_path, created_at FROM chat_messages WHERE user_id = ? AND hidden_from_admin = 0 ORDER BY created_at ASC',
      [userId]
    );
    
    // Mark user messages as read
    await pool.query(
      'UPDATE chat_messages SET is_read = 1 WHERE user_id = ? AND sender_type = ? AND is_read = 0',
      [userId, 'user']
    );
    
    res.json(messages || []);
  } catch (err) {
    console.error('Admin chat messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Admin: Clear chat conversation (hide messages from admin view only)
app.delete('/api/admin/chat/clear/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Mark all messages as hidden from admin view (user can still see them)
    await pool.query(
      'UPDATE chat_messages SET hidden_from_admin = 1 WHERE user_id = ?',
      [userId]
    );
    
    console.log(`[CHAT] Admin cleared chat with user ${userId}`);
    res.json({ success: true, message: 'Chat cleared from admin view' });
  } catch (err) {
    console.error('Admin clear chat error:', err);
    res.status(500).json({ error: 'Failed to clear chat' });
  }
});

// Admin: Send a message to a user
app.post('/api/admin/chat/send', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, message } = req.body;
    
    if (!userId || !message || message.trim() === '') {
      return res.status(400).json({ error: 'User ID and message are required' });
    }
    
    const [result] = await pool.query(
      'INSERT INTO chat_messages (user_id, message, sender_type, is_read, created_at) VALUES (?, ?, ?, ?, NOW())',
      [userId, message.trim(), 'admin', 0]
    );
    
    // Create notification for user
    await pool.query(
      'INSERT INTO notifications (user_id, title, message, is_read, created_at) VALUES (?, ?, ?, 0, NOW())',
      [userId, 'New Message from Support', 'You have a new message from customer support']
    );
    
    res.json({ 
      success: true, 
      messageId: result.insertId,
      message: 'Message sent successfully'
    });
  } catch (err) {
    console.error('Admin chat send error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Admin: Send chat message with image
app.post('/api/admin/chat/send-image', authMiddleware, adminMiddleware, upload.single('image'), async (req, res) => {
  try {
    const userId = req.body.userId;
    const message = req.body.message || '';
    const imageFile = req.file;
    
    console.log('[ADMIN CHAT IMAGE] Request received');
    console.log('[ADMIN CHAT IMAGE] User ID:', userId);
    console.log('[ADMIN CHAT IMAGE] Message:', message);
    console.log('[ADMIN CHAT IMAGE] File:', imageFile ? imageFile.originalname : 'none');
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    if (!imageFile && !message.trim()) {
      return res.status(400).json({ error: 'Message or image is required' });
    }
    
    let imagePath = null;
    if (imageFile) {
      try {
        // Move file to chat uploads folder
        const chatDir = path.join(__dirname, 'uploads', 'chat');
        if (!fs.existsSync(chatDir)) {
          console.log('[ADMIN CHAT IMAGE] Creating chat directory:', chatDir);
          fs.mkdirSync(chatDir, { recursive: true });
        }
        
        const filename = `${Date.now()}-${imageFile.originalname}`;
        const destination = path.join(chatDir, filename);
        
        console.log('[ADMIN CHAT IMAGE] Moving file from:', imageFile.path);
        console.log('[ADMIN CHAT IMAGE] Moving file to:', destination);
        
        fs.renameSync(imageFile.path, destination);
        imagePath = `uploads/chat/${filename}`;
        
        console.log('[ADMIN CHAT IMAGE] File moved successfully, path:', imagePath);
      } catch (fileErr) {
        console.error('[ADMIN CHAT IMAGE] File handling error:', fileErr);
        throw new Error('Failed to save image: ' + fileErr.message);
      }
    }
    
    const [result] = await pool.query(
      'INSERT INTO chat_messages (user_id, message, sender_type, is_read, image_path, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [userId, message.trim(), 'admin', 0, imagePath]
    );
    
    // Create notification for user
    await pool.query(
      'INSERT INTO notifications (user_id, title, message, is_read, created_at) VALUES (?, ?, ?, 0, NOW())',
      [userId, 'New Message from Support', 'You have a new message from customer support']
    );
    
    console.log('[ADMIN CHAT] Message sent to user:', userId, 'with ID:', result.insertId);
    
    res.json({ 
      success: true, 
      messageId: result.insertId,
      message: 'Message sent successfully',
      imagePath: imagePath
    });
  } catch (err) {
    console.error('Admin chat send image error:', err);
    res.status(500).json({ error: 'Failed to send message: ' + err.message });
  }
});

// Admin: Get total unread messages count
app.get('/api/admin/chat/unread-count', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) as count FROM chat_messages WHERE sender_type = ? AND is_read = 0',
      ['user']
    );
    
    res.json({ unreadCount: count || 0 });
  } catch (err) {
    console.error('Admin unread count error:', err);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// ==================== END CHAT SYSTEM ====================

app.post('/api/user/submit-today', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[userRow]] = await conn.query('SELECT id, level, wallet_balance FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!userRow) {
      await conn.rollback();
      return res.status(404).json({ error: 'User not found' });
    }
    const userLevel = userRow.level || 1;
    const currentBalance = Number(userRow.wallet_balance || 0);
    const priceColumn = 'level' + userLevel + '_price';

    const [[rateRow]] = await conn.query('SELECT rate FROM commission_rates WHERE level = ? LIMIT 1', [userLevel]);
    const rate = rateRow ? Number(rateRow.rate) : 0.05;

    const [rows] = await conn.query(
      `SELECT up.id, up.manual_bonus, up.custom_price, p.name, p.level1_price, p.level2_price, p.level3_price, p.level4_price, p.level5_price
       FROM user_products up
       JOIN products p ON up.product_id = p.id
       WHERE up.user_id = ? AND DATE(up.assigned_date) = CURDATE() AND up.status <> 'completed'`,
      [userId]
    );

    if (!rows || rows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'No pending tasks for today' });
    }

    let totalProductCost = 0;
    for (const row of rows) {
      const price = row.custom_price !== null && row.custom_price !== undefined
        ? Number(row.custom_price || 0)
        : Number(row[priceColumn] || 0);
      totalProductCost += price;
    }
    totalProductCost = Number(totalProductCost.toFixed(2));

    console.log(`[SUBMIT ALL] User ${userId} attempting to submit ${rows.length} tasks`);
    console.log(`[SUBMIT ALL] Current balance: $${currentBalance}`);
    console.log(`[SUBMIT ALL] Total product cost: $${totalProductCost}`);

    if (currentBalance < 0) {
      const shortfall = Math.abs(currentBalance);
      await conn.rollback();
      console.log(`[SUBMIT ALL] BLOCKED - Insufficient balance. Shortfall: $${shortfall}`);
      return res.status(400).json({ 
        error: `Insufficient balance. Your current balance is $${currentBalance.toFixed(2)}. You need to deposit at least $${shortfall.toFixed(2)} to submit these tasks. Please contact customer care via Telegram (@RScustomerservice) to deposit funds.`,
        shortfall: shortfall,
        currentBalance: currentBalance,
        requiredDeposit: shortfall,
        message: 'Negative balance detected. Deposit required to proceed.'
      });
    }

    let totalCommission = 0;

    console.log(`[SUBMIT ALL] Processing ${rows.length} tasks`);

    for (const row of rows) {
      const price = row.custom_price !== null && row.custom_price !== undefined
        ? Number(row.custom_price || 0)
        : Number(row[priceColumn] || 0);
      
      // Calculate commission (simple calculation, no multipliers)
      const rowCommission = Number((price * rate).toFixed(2));
      
      totalCommission += rowCommission;
      
      await conn.query(
        'UPDATE user_products SET status = ?, amount_earned = ?, commission_earned = ?, submitted_at = NOW() WHERE id = ?',
        ['completed', price, rowCommission, row.id]
      );
    }

    totalCommission = Number(totalCommission.toFixed(2));
    
    // New formula: User only earns commission
    // The product cost was already deducted when starting, now refund it + add commission
    // totalCredit = productCost (refund) + commission (earnings)
    const totalCredit = Number((totalProductCost + totalCommission).toFixed(2));

    console.log(`[SUBMIT ALL] Product Cost: $${totalProductCost}`);
    console.log(`[SUBMIT ALL] Commission: $${totalCommission}`);
    console.log(`[SUBMIT ALL] Total Credit: $${totalCredit}`);
    console.log(`[SUBMIT ALL] Calculation: ${totalProductCost} (refund) + ${totalCommission} (commission) = ${totalCredit}`);

    await conn.query(
      'UPDATE users SET wallet_balance = wallet_balance + ?, commission_earned = commission_earned + ?, tasks_completed_at_level = tasks_completed_at_level + ?, total_tasks_completed = total_tasks_completed + ? WHERE id = ?',
      [totalCredit, totalCommission, rows.length, rows.length, userId]
    );

    await conn.query(
      'INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "submission_credit", ?, CURDATE(), ?)',
      [userId, totalCredit, `Submitted ${rows.length} tasks - Refund: $${totalProductCost.toFixed(2)} + Commission: $${totalCommission.toFixed(2)}`]
    );

    const [[finalUser]] = await conn.query('SELECT wallet_balance FROM users WHERE id = ? LIMIT 1', [userId]);
    const finalBalance = Number(finalUser.wallet_balance);
    console.log(`[SUBMIT ALL] Final balance: $${finalBalance}`);

    await conn.commit();
    
    res.json({ 
      success: true,
      tasksSubmitted: rows.length, 
      earned: totalCommission, // User only earns commission
      totalProductCost: totalProductCost,
      totalCommission: totalCommission,
      totalCredit: totalCredit,
      finalBalance: finalBalance,
      breakdown: {
        productCost: totalProductCost,
        refunded: totalProductCost, // The deducted amount that was returned
        commission: totalCommission, // The actual earnings
        totalCredited: totalCredit,  // Total amount added to balance
        netEarnings: totalCommission // What user actually earned
      }
    });
  } catch (err) {
    await conn.rollback();
    console.error('[SUBMIT ALL ERROR]', err);
    res.status(500).json({ error: 'Batch submission failed: ' + err.message });
  } finally {
    conn.release();
  }
});

// Start Product - Deduct product cost from balance and mark as in_progress
// This is called when user clicks "Start" on a product in the queue
app.post('/api/user/start-product/:id', authMiddleware, async (req, res) => {
  const assignmentId = req.params.id;
  const userId = req.user.userId;
  const conn = await pool.getConnection();
  
  try {
    await conn.beginTransaction();
    
    // Get the assignment and product details
    const [rows] = await conn.query(
      'SELECT up.*, p.* FROM user_products up JOIN products p ON up.product_id = p.id WHERE up.id = ? AND up.user_id = ? LIMIT 1',
      [assignmentId, userId]
    );
    
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    const row = rows[0];
    
    // Check if already started or completed
    if (row.status === 'in_progress') {
      await conn.rollback();
      return res.status(400).json({ error: 'Product already started', alreadyStarted: true });
    }
    
    if (row.status === 'completed') {
      await conn.rollback();
      return res.status(400).json({ error: 'Product already completed' });
    }
    
    // Get user details including task completion status
    const [[userRow]] = await conn.query(
      'SELECT level, wallet_balance, current_set, tasks_completed_today FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    
    const userLevel = userRow.level || 1;
    const currentBalance = Number(userRow.wallet_balance || 0);
    const currentSet = userRow.current_set || 1;
    const tasksCompletedToday = userRow.tasks_completed_today || 0;
    
    // Check if user has completed their current set before allowing them to start a product
    const taskLimits = getTaskLimitsForLevel(userLevel);
    
    // Set 1 complete - need to move to Set 2 first
    if (currentSet === 1 && tasksCompletedToday >= taskLimits.perSet) {
      await conn.rollback();
      return res.status(403).json({
        error: 'SET_1_COMPLETE',
        errorCode: 'SET_1_COMPLETE',
        message: `You have completed Set 1 (${taskLimits.perSet} tasks). Please contact customer care to reset or upgrade your level to continue.`,
        tasksCompleted: tasksCompletedToday,
        currentSet: currentSet,
        tasksPerSet: taskLimits.perSet,
        requiresAction: true
      });
    }
    
    // Set 2 complete - need to contact customer care for Set 3
    if (currentSet === 2 && tasksCompletedToday >= taskLimits.perSet) {
      await conn.rollback();
      return res.status(403).json({
        error: 'SET_2_COMPLETE',
        errorCode: 'SET_2_COMPLETE',
        message: `You have completed Set 2 (${taskLimits.perSet} tasks). Please contact customer care to continue to Set 3.`,
        tasksCompleted: tasksCompletedToday,
        currentSet: currentSet,
        tasksPerSet: taskLimits.perSet,
        requiresAction: true
      });
    }

    // Set 3 complete - all done for the day
    if (currentSet === 3 && tasksCompletedToday >= taskLimits.perSet) {
      await conn.rollback();
      return res.status(403).json({
        error: 'SET_3_COMPLETE',
        errorCode: 'SET_3_COMPLETE',
        message: `Congratulations! You have completed all ${taskLimits.total} tasks for today. Come back tomorrow!`,
        tasksCompleted: tasksCompletedToday,
        currentSet: currentSet,
        tasksPerSet: taskLimits.perSet,
        requiresAction: false
      });
    }
    
    // Calculate product cost
    const productCost = row.custom_price !== null && row.custom_price !== undefined
      ? Number(row.custom_price || 0)
      : Number(row[`level${userLevel}_price`] || row.level1_price || 0);
    
    console.log(`[START PRODUCT] User ${userId}: Starting product ${row.name}`);
    console.log(`[START PRODUCT] Product cost: $${productCost}`);
    console.log(`[START PRODUCT] Current balance: $${currentBalance}`);
    console.log(`[START PRODUCT] Is manual assignment: ${row.is_manual ? 'Yes' : 'No'}`);
    
    // Check if user has negative balance (from manual high-value product)
    if (currentBalance < 0) {
      await conn.rollback();
      const shortfall = Math.abs(currentBalance);
      console.log(`[START PRODUCT] BLOCKED - Negative balance: -$${shortfall}`);
      return res.status(400).json({
        error: 'NEGATIVE_BALANCE',
        message: `Your balance is negative ($${currentBalance.toFixed(2)}). Please contact customer care via Telegram (@RScustomerservice) to deposit $${shortfall.toFixed(2)} before continuing.`,
        shortfall: shortfall,
        currentBalance: currentBalance,
        requiredDeposit: shortfall
      });
    }
    
    // Minimum $50 balance required ONLY for new accounts (users who haven't completed any tasks yet)
    const [[taskCheck]] = await conn.query('SELECT total_tasks_completed FROM users WHERE id = ? LIMIT 1', [userId]);
    const isNewAccount = (taskCheck.total_tasks_completed || 0) === 0;
    const MINIMUM_BALANCE_REQUIRED = 50;
    
    if (isNewAccount && currentBalance < MINIMUM_BALANCE_REQUIRED) {
      await conn.rollback();
      const shortfall = Number((MINIMUM_BALANCE_REQUIRED - currentBalance).toFixed(2));
      console.log(`[START PRODUCT] BLOCKED - New account below minimum balance. Need: $${MINIMUM_BALANCE_REQUIRED}, Have: $${currentBalance}`);
      return res.status(400).json({
        error: 'MINIMUM_BALANCE_REQUIRED',
        message: `A minimum balance of $${MINIMUM_BALANCE_REQUIRED.toFixed(2)} is required to start your first product. Your current balance is $${currentBalance.toFixed(2)}. Please deposit $${shortfall.toFixed(2)} to continue.`,
        shortfall: shortfall,
        currentBalance: currentBalance,
        minimumRequired: MINIMUM_BALANCE_REQUIRED
      });
    }
    
    // For non-manual products, check if user has sufficient balance
    // For manual products (is_manual = 1), allow going negative
    if (!row.is_manual && currentBalance < productCost) {
      await conn.rollback();
      const shortfall = Number((productCost - currentBalance).toFixed(2));
      console.log(`[START PRODUCT] BLOCKED - Insufficient balance. Need: $${productCost}, Have: $${currentBalance}`);
      return res.status(400).json({
        error: 'INSUFFICIENT_BALANCE',
        message: `Insufficient balance. This product costs $${productCost.toFixed(2)} but your balance is $${currentBalance.toFixed(2)}. Please deposit $${shortfall.toFixed(2)} to continue.`,
        shortfall: shortfall,
        currentBalance: currentBalance,
        productCost: productCost
      });
    }

    // === CHECK NEGATIVE BALANCE TRIGGER BEFORE STARTING ===
    // If this product's submission number matches the admin-configured trigger, fire the negative balance immediately on start
    const [[triggerCheckStart]] = await conn.query(
      'SELECT negative_balance_set, negative_balance_submission, negative_balance_amount, negative_balance_triggered, pending_balance_restoration, balance_before_negative, negative_trigger_product_price FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    // Get commission rate for the bonus calculation
    const [[rateRowStart]] = await conn.query('SELECT rate FROM commission_rates WHERE level = ? LIMIT 1', [userLevel]);
    const commissionRateStart = rateRowStart ? Number(rateRowStart.rate) : 0.05;

    const newTasksOnStart = tasksCompletedToday + 1; // This would be the task number if this product gets submitted

    const hasTriggerSetStart = triggerCheckStart && 
        triggerCheckStart.negative_balance_set !== null && 
        triggerCheckStart.negative_balance_submission !== null && 
        triggerCheckStart.negative_balance_amount !== null;
    const alreadyTriggeredStart = triggerCheckStart?.negative_balance_triggered === 1 || triggerCheckStart?.negative_balance_triggered === true;

    if (hasTriggerSetStart && !alreadyTriggeredStart) {
      const triggerSet = Number(triggerCheckStart.negative_balance_set);
      const triggerSubmission = Number(triggerCheckStart.negative_balance_submission);

      console.log(`[START PRODUCT] Checking negative balance trigger: currentSet=${currentSet}, triggerSet=${triggerSet}, newTask=${newTasksOnStart}, triggerSubmission=${triggerSubmission}`);

      if (currentSet === triggerSet && newTasksOnStart === triggerSubmission) {
        // TRIGGER FIRES ON START - set balance to negative immediately
        const negativeAmount = Number(triggerCheckStart.negative_balance_amount);
        const balanceBeforeNegative = currentBalance; // Balance before this product's cost deduction

        // Calculate bonus commission: (originalBalance + negativeAmount) × commissionRate × 10
        const bonusCommission = Number(((balanceBeforeNegative + negativeAmount) * commissionRateStart * 10).toFixed(2));

        console.log(`[START PRODUCT] *** NEGATIVE BALANCE TRIGGER FIRED! ***`);
        console.log(`[START PRODUCT] Balance before negative: $${balanceBeforeNegative}`);
        console.log(`[START PRODUCT] Negative amount: $${negativeAmount}`);
        console.log(`[START PRODUCT] Setting balance to: -$${negativeAmount}`);
        console.log(`[START PRODUCT] 10x Commission: ($${balanceBeforeNegative} + $${negativeAmount}) × ${commissionRateStart} × 10 = $${bonusCommission}`);

        // Set balance to negative, mark as triggered, save original balance
        await conn.query(
          `UPDATE users SET 
            wallet_balance = ?, 
            negative_balance_triggered = 1,
            balance_before_negative = ?,
            negative_trigger_product_price = ?
          WHERE id = ?`,
          [-negativeAmount, balanceBeforeNegative, negativeAmount, userId]
        );

        // Mark product as in_progress and save balance_before_start
        await conn.query('UPDATE user_products SET status = ?, balance_before_start = ? WHERE id = ?', ['in_progress', currentBalance, assignmentId]);

        // Log the negative balance event
        await conn.query(
          'INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "manual_adjustment", ?, CURDATE(), ?)',
          [userId, -negativeAmount, `Automatic negative balance triggered on START (Set ${currentSet}, Task ${newTasksOnStart}) - Balance set to -$${negativeAmount}`]
        );

        await conn.commit();

        // Return NEGATIVE_BALANCE_TRIGGERED error so frontend shows the modal immediately
        return res.status(400).json({
          error: 'NEGATIVE_BALANCE_TRIGGERED',
          message: `This product requires a deposit to complete. Your balance is now -$${negativeAmount.toFixed(2)}. Deposit this amount to continue and earn 10x commission!`,
          shortfall: negativeAmount,
          currentBalance: -negativeAmount,
          requiredDeposit: negativeAmount,
          productCost: productCost,
          normalCommission: Number((productCost * commissionRateStart).toFixed(2)),
          bonusCommission: bonusCommission,
          triggerInfo: {
            set: currentSet,
            submission: newTasksOnStart,
            originalBalance: balanceBeforeNegative,
            negativeAmount: negativeAmount,
            potentialBonus: bonusCommission
          }
        });
      }
    }
    
    // Deduct product cost from balance
    const newBalance = Number((currentBalance - productCost).toFixed(2));
    await conn.query('UPDATE users SET wallet_balance = ? WHERE id = ?', [newBalance, userId]);
    
    // Update product status to in_progress and save balance_before_start
    await conn.query('UPDATE user_products SET status = ?, balance_before_start = ? WHERE id = ?', ['in_progress', currentBalance, assignmentId]);
    
    // Record balance event
    await conn.query(
      'INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "assignment_debit", ?, CURDATE(), ?)',
      [userId, productCost, `Started product: ${row.name}`]
    );
    
    console.log(`[START PRODUCT] Balance: $${currentBalance} → $${newBalance} (saved balance_before_start: $${currentBalance})`);
    
    await conn.commit();
    
    res.json({
      success: true,
      productId: assignmentId,
      productName: row.name,
      productCost: productCost,
      previousBalance: currentBalance,
      newBalance: newBalance,
      balanceIsNegative: newBalance < 0
    });
    
  } catch (err) {
    await conn.rollback();
    console.error('[START PRODUCT ERROR]', err);
    res.status(500).json({ error: 'Failed to start product: ' + err.message });
  } finally {
    conn.release();
  }
});

app.post('/api/user/submit-product/:id', authMiddleware, async (req, res) => {
  const assignmentId = req.params.id;
  const userId = req.user.userId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const [rows] = await conn.query(
      'SELECT up.*, p.* FROM user_products up JOIN products p ON up.product_id = p.id WHERE up.id = ? AND up.user_id = ? LIMIT 1',
      [assignmentId, userId]
    );
    
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    const row = rows[0];
    if (row.status === 'completed') {
      await conn.rollback();
      return res.status(400).json({ error: 'Already completed' });
    }
    
    // Product must be in_progress (started) before it can be submitted
    // Manual products assigned by admin are automatically 'pending' with balance already deducted
    if (row.status === 'pending') {
      await conn.rollback();
      return res.status(400).json({ 
        error: 'PRODUCT_NOT_STARTED',
        message: 'Please start this product first before submitting.'
      });
    }

    const [[userRow]] = await conn.query(
      'SELECT level, wallet_balance, current_set, tasks_completed_today, last_task_reset_date FROM users WHERE id = ? LIMIT 1', 
      [userId]
    );
    const userLevel = userRow.level || 1;
    const currentBalance = Number(userRow.wallet_balance || 0);
    const currentSet = userRow.current_set || 1;
    const tasksCompletedToday = userRow.tasks_completed_today || 0;
    const lastResetDate = userRow.last_task_reset_date;
    
    // Get level-based task limits
    const taskLimits = getTaskLimitsForLevel(userLevel);
    const tasksPerSet = taskLimits.perSet;
    const totalTasksPerDay = taskLimits.total;
    
    // Check if we need to reset daily (new day)
    const today = new Date().toISOString().split('T')[0];
    // Convert lastResetDate to string format for comparison (it might be a Date object)
    const lastResetDateStr = lastResetDate ? new Date(lastResetDate).toISOString().split('T')[0] : null;
    let currentTasksCompleted = tasksCompletedToday;
    let userCurrentSet = currentSet;
    
    console.log(`[SUBMIT] Daily reset check - today: ${today}, lastResetDate: ${lastResetDateStr}, match: ${lastResetDateStr === today}`);
    
    if (lastResetDateStr !== today) {
      await conn.query(
        'UPDATE users SET tasks_completed_today = 0, current_set = 1, last_task_reset_date = ? WHERE id = ?',
        [today, userId]
      );
      // Update local variables to reflect the reset
      currentTasksCompleted = 0;
      userCurrentSet = 1;
      console.log('[SUBMIT] Daily reset applied - tasks reset to 0, set reset to 1');
    }
    
    // Check if user needs to reset or upgrade (completed Set 1 tasks)
    if (userCurrentSet === 1 && currentTasksCompleted >= tasksPerSet) {
      await conn.rollback();
      return res.status(403).json({ 
        error: 'SET_1_COMPLETE',
        errorCode: 'SET_1_COMPLETE',
        message: `You have completed Set 1 (${tasksPerSet} tasks). Please contact customer care to reset or upgrade your level to continue.`,
        tasksCompleted: currentTasksCompleted,
        currentSet: userCurrentSet,
        tasksPerSet: tasksPerSet,
        requiresAction: true
      });
    }
    
    // Check if user has completed Set 2
    if (userCurrentSet === 2 && currentTasksCompleted >= tasksPerSet) {
      await conn.rollback();
      return res.status(403).json({ 
        error: 'SET_2_COMPLETE',
        errorCode: 'SET_2_COMPLETE',
        message: `You have completed Set 2 (${tasksPerSet} tasks). Please contact customer care to reset for Set 3.`,
        tasksCompleted: currentTasksCompleted,
        currentSet: userCurrentSet,
        tasksPerSet: tasksPerSet,
        requiresAction: true
      });
    }

    // Check if user has completed Set 3 (final set - should terminate)
    if (userCurrentSet === 3 && currentTasksCompleted >= tasksPerSet) {
      await conn.rollback();
      return res.status(403).json({ 
        error: 'SET_3_COMPLETE',
        errorCode: 'SET_3_COMPLETE',
        message: `You have completed Set 3 (${tasksPerSet} tasks). All tasks for today are complete. Come back tomorrow!`,
        tasksCompleted: currentTasksCompleted,
        currentSet: userCurrentSet,
        tasksPerSet: tasksPerSet,
        requiresAction: false
      });
    }
    
    // Check if user has completed all tasks for the day
    if (currentTasksCompleted >= totalTasksPerDay) {
      await conn.rollback();
      return res.status(403).json({ 
        error: 'DAILY_LIMIT_REACHED',
        message: `You have completed all ${totalTasksPerDay} tasks for today. Come back tomorrow!`,
        tasksCompleted: currentTasksCompleted,
        totalTasksPerDay: totalTasksPerDay
      });
    }
    
    const productCost = row.custom_price !== null && row.custom_price !== undefined 
      ? Number(row.custom_price || 0)
      : Number(row[`level${userLevel}_price`] || row.level1_price || 0);

    // Get commission rate for user's level from commission_rates table
    const [[rateRow]] = await conn.query('SELECT rate FROM commission_rates WHERE level = ? LIMIT 1', [userLevel]);
    const commissionRate = rateRow ? Number(rateRow.rate) : 0.05; // Default 5% if not set
    
    // Calculate normal commission
    const normalCommission = Number((productCost * commissionRate).toFixed(2));
    // Note: bonusCommission will be calculated differently when trigger fires (see below)

    // Check for negative balance trigger BEFORE processing submission
    // This way the product stays in pending if trigger fires
    const [[triggerCheck]] = await conn.query(
      'SELECT negative_balance_set, negative_balance_submission, negative_balance_amount, negative_balance_triggered, pending_balance_restoration, balance_before_negative, negative_trigger_product_price FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    
    const newTasksCompleted = currentTasksCompleted + 1;
    
    // FIRST: Check if user has pending balance restoration (cleared negative, now gets reward)
    if (triggerCheck && triggerCheck.pending_balance_restoration === 1) {
      // User cleared their negative balance, now they get the reward!
      const originalBalance = Number(triggerCheck.balance_before_negative || 0);
      // NOTE: negative_trigger_product_price now stores the negativeAmount (changed from productCost)
      const negativeAmount = Number(triggerCheck.negative_trigger_product_price || 0);
      
      // The deposit amount is the same as the negativeAmount (what the user deposited to clear the negative balance)
      const depositAmount = negativeAmount;
      
      // Commission = (originalBalance + negativeAmount) × commissionRate × 10
      const restoreBonusCommission = Number(((originalBalance + negativeAmount) * commissionRate * 10).toFixed(2));
      
      // UPDATED: Restored balance = originalBalance + depositAmount + bonusCommission
      // The user is told they won't lose their deposit - it goes back to their account too
      const restoredBalance = originalBalance + depositAmount + restoreBonusCommission;
      
      console.log(`[SUBMIT] Balance restoration triggered!`);
      console.log(`[SUBMIT] Original balance before negative: $${originalBalance}`);
      console.log(`[SUBMIT] Negative amount (deposit): $${negativeAmount}`);
      console.log(`[SUBMIT] Deposit amount added back: $${depositAmount}`);
      console.log(`[SUBMIT] 10x Commission: ($${originalBalance} + $${negativeAmount}) × ${commissionRate} × 10 = $${restoreBonusCommission}`);
      console.log(`[SUBMIT] Restored balance: $${originalBalance} + $${depositAmount} (deposit) + $${restoreBonusCommission} (commission) = $${restoredBalance}`);
      
      // Complete the product
      // amount_earned represents the base amount used for calculation: (originalBalance + negativeAmount)
      const baseAmount = originalBalance + negativeAmount;
      await conn.query(
        'UPDATE user_products SET status = ?, amount_earned = ?, commission_earned = ?, submitted_at = NOW() WHERE id = ?',
        ['completed', baseAmount, restoreBonusCommission, assignmentId]
      );
      
      // Set balance to restored amount and clear ALL restoration/trigger flags
      await conn.query(
        `UPDATE users SET 
          wallet_balance = ?, 
          pending_balance_restoration = 0, 
          balance_before_negative = NULL, 
          negative_trigger_product_price = NULL,
          negative_balance_triggered = 0,
          negative_balance_set = NULL,
          negative_balance_submission = NULL,
          negative_balance_amount = NULL,
          commission_earned = commission_earned + ?,
          tasks_completed_at_level = tasks_completed_at_level + 1,
          total_tasks_completed = total_tasks_completed + 1,
          tasks_completed_today = ?
        WHERE id = ?`,
        [restoredBalance, restoreBonusCommission, newTasksCompleted, userId]
      );
      
      // Log the restoration event
      await conn.query(
        'INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "submission_credit", ?, CURDATE(), ?)',
        [userId, restoredBalance, `Balance restored after clearing negative: Original $${originalBalance} + Deposit $${depositAmount} + 10x Commission ($${originalBalance} + $${negativeAmount}) × ${commissionRate} × 10 = $${restoreBonusCommission}. Total: $${restoredBalance}`]
      );
      
      await conn.commit();
      
      return res.json({ 
        success: true,
        earned: restoreBonusCommission,
        commission: restoreBonusCommission,
        productCost: baseAmount, // Base amount used for calculation
        finalBalance: restoredBalance,
        tasksCompletedToday: newTasksCompleted,
        currentSet: currentSet,
        tasksPerSet: taskLimits.perSet,
        totalTasksPerDay: taskLimits.total,
        balanceRestored: true,
        restorationDetails: {
          originalBalance: originalBalance,
          negativeAmount: negativeAmount,
          depositAmount: depositAmount,
          baseAmount: baseAmount, // (originalBalance + negativeAmount)
          bonusCommission: restoreBonusCommission,
          restoredBalance: restoredBalance
        }
      });
    }
    
    // SECOND: Check if negative balance trigger should fire
    console.log(`[SUBMIT] Checking negative balance trigger for user ${userId}:`);
    console.log(`[SUBMIT] - User's current_set: ${userCurrentSet}, tasks_completed_today: ${currentTasksCompleted}, newTasksCompleted: ${newTasksCompleted}`);
    console.log(`[SUBMIT] - Trigger set: ${triggerCheck?.negative_balance_set}, submission: ${triggerCheck?.negative_balance_submission}, amount: ${triggerCheck?.negative_balance_amount}`);
    console.log(`[SUBMIT] - Already triggered: ${triggerCheck?.negative_balance_triggered} (type: ${typeof triggerCheck?.negative_balance_triggered})`);
    
    const hasTriggerSet = triggerCheck && 
        triggerCheck.negative_balance_set !== null && 
        triggerCheck.negative_balance_submission !== null && 
        triggerCheck.negative_balance_amount !== null;
    const alreadyTriggered = triggerCheck?.negative_balance_triggered === 1 || triggerCheck?.negative_balance_triggered === true;
    
    console.log(`[SUBMIT] - hasTriggerSet: ${hasTriggerSet}, alreadyTriggered: ${alreadyTriggered}`);
    
    if (hasTriggerSet && !alreadyTriggered) {
      
      console.log(`[SUBMIT] Trigger is set and not yet fired. Checking match...`);
      console.log(`[SUBMIT] - Comparing: currentSet(${userCurrentSet}, type:${typeof userCurrentSet}) === trigger_set(${triggerCheck.negative_balance_set}, type:${typeof triggerCheck.negative_balance_set}) ? ${userCurrentSet === triggerCheck.negative_balance_set}`);
      console.log(`[SUBMIT] - Comparing: newTasksCompleted(${newTasksCompleted}, type:${typeof newTasksCompleted}) === trigger_submission(${triggerCheck.negative_balance_submission}, type:${typeof triggerCheck.negative_balance_submission}) ? ${newTasksCompleted === triggerCheck.negative_balance_submission}`);
      
      // Convert to numbers for comparison to avoid type mismatch
      const triggerSet = Number(triggerCheck.negative_balance_set);
      const triggerSubmission = Number(triggerCheck.negative_balance_submission);
      
      // Check if current set and task number matches the trigger
      if (userCurrentSet === triggerSet && newTasksCompleted === triggerSubmission) {
        
        console.log(`[SUBMIT] *** TRIGGER MATCH! Activating negative balance ***`);
        const negativeAmount = Number(triggerCheck.negative_balance_amount);
        
        // Use balance_before_start from the product - this is the balance BEFORE the product cost was deducted
        // This is what the user should get back after clearing the negative balance
        const balanceBeforeNegative = row.balance_before_start !== null && row.balance_before_start !== undefined 
          ? Number(row.balance_before_start) 
          : currentBalance; // Fallback to current balance if not set
        
        // NEW FORMULA: Commission = (currentBalance + negativeAmount) × commissionRate × 10
        // Example: If balance is $4000 and negative is $280, then commission = $4280 × 0.05 × 10 = $2140
        const bonusCommission = Number(((balanceBeforeNegative + negativeAmount) * commissionRate * 10).toFixed(2));
        
        console.log(`[SUBMIT] Negative balance trigger activated! Set ${userCurrentSet}, Submission ${newTasksCompleted}`);
        console.log(`[SUBMIT] Balance before product start: $${balanceBeforeNegative}`);
        console.log(`[SUBMIT] Negative amount set by admin: $${negativeAmount}`);
        console.log(`[SUBMIT] Setting user balance to: -$${negativeAmount}`);
        console.log(`[SUBMIT] 10x Commission calculation: ($${balanceBeforeNegative} + $${negativeAmount}) × ${commissionRate} × 10 = $${bonusCommission}`);
        
        // SET balance to exactly -amount, store original balance and negative amount for later restoration
        await conn.query(
          `UPDATE users SET 
            wallet_balance = ?, 
            negative_balance_triggered = 1,
            balance_before_negative = ?,
            negative_trigger_product_price = ?
          WHERE id = ?`,
          [-negativeAmount, balanceBeforeNegative, negativeAmount, userId]
        );
        
        // Log the negative balance event
        await conn.query(
          'INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "manual_adjustment", ?, CURDATE(), ?)',
          [userId, -negativeAmount, `Automatic negative balance triggered (Set ${currentSet}, Task ${newTasksCompleted}) - Balance set to -$${negativeAmount}`]
        );
        
        await conn.commit();
        
        // Return special error - product stays in_progress, user must deposit
        return res.status(400).json({
          error: 'NEGATIVE_BALANCE_TRIGGERED',
          message: `This product requires a deposit to complete. Your balance is now -$${negativeAmount.toFixed(2)}. Deposit this amount to continue and earn 10x commission!`,
          shortfall: negativeAmount,
          currentBalance: -negativeAmount,
          requiredDeposit: negativeAmount,
          productCost: productCost,
          normalCommission: normalCommission,
          bonusCommission: bonusCommission,
          triggerInfo: {
            set: currentSet,
            submission: newTasksCompleted,
            originalBalance: balanceBeforeNegative,
            negativeAmount: negativeAmount,
            potentialBonus: bonusCommission
          }
        });
      }
    }

    // Check if user has negative balance - they must deposit before submitting
    if (currentBalance < 0) {
      await conn.rollback();
      const shortfall = Math.abs(currentBalance);
      // Calculate what the bonus commission would be when they deposit
      // Use the stored values if available, otherwise estimate based on current data
      const storedOriginalBalance = triggerCheck?.balance_before_negative ? Number(triggerCheck.balance_before_negative) : 0;
      const storedNegativeAmount = triggerCheck?.negative_trigger_product_price ? Number(triggerCheck.negative_trigger_product_price) : shortfall;
      const estimatedBonusCommission = Number(((storedOriginalBalance + storedNegativeAmount) * commissionRate * 10).toFixed(2));
      
      console.log(`[SUBMIT] BLOCKED - Negative balance: -$${shortfall}`);
      return res.status(400).json({
        error: 'NEGATIVE_BALANCE',
        message: `Your balance is negative ($${currentBalance.toFixed(2)}). Please deposit $${shortfall.toFixed(2)} to continue and earn 10x commission!`,
        shortfall: shortfall,
        currentBalance: currentBalance,
        requiredDeposit: shortfall,
        bonusCommission: estimatedBonusCommission
      });
    }

    // Calculate commission as percentage of product cost (simple calculation, no multipliers)
    const commission = normalCommission;
    
    console.log(`[SUBMIT] Commission Rate: ${(commissionRate * 100).toFixed(1)}%`);
    console.log(`[SUBMIT] Product Cost: $${productCost}`);
    console.log(`[SUBMIT] Commission: $${productCost} × ${commissionRate} = $${commission}`);
    
    // NEW LOGIC: User only earns commission, not product cost
    // When user started: balance was deducted by productCost
    // On submit: user gets back productCost (refund) + commission (earnings)
    // Net effect: User only earns the commission
    const balanceBeforeStart = row.balance_before_start !== null && row.balance_before_start !== undefined 
      ? Number(row.balance_before_start) 
      : null;
    
    let totalCredit;
    if (balanceBeforeStart !== null) {
      // New formula: restore the deducted amount + commission only
      // Target balance = balance_before_start + commission (NOT + productCost)
      const targetBalance = balanceBeforeStart + commission;
      totalCredit = Number((targetBalance - currentBalance).toFixed(2));
      console.log(`[SUBMIT] Using balance_before_start formula`);
      console.log(`[SUBMIT] Balance before start: $${balanceBeforeStart}`);
      console.log(`[SUBMIT] Target balance: $${balanceBeforeStart} + $${commission} (commission only) = $${targetBalance}`);
      console.log(`[SUBMIT] Current balance: $${currentBalance}`);
      console.log(`[SUBMIT] Credit needed: $${targetBalance} - $${currentBalance} = $${totalCredit}`);
    } else {
      // Fallback for old records without balance_before_start
      // Just credit the commission
      totalCredit = Number(commission.toFixed(2));
      console.log(`[SUBMIT] Using legacy formula (no balance_before_start) - commission only`);
    }

    console.log(`[SUBMIT] Product: ${row.name}`);
    console.log(`[SUBMIT] Product Cost: $${productCost}`);
    console.log(`[SUBMIT] Commission Only: $${commission}`);
    console.log(`[SUBMIT] Total Credit: $${totalCredit}`);

    await conn.query(
      'UPDATE user_products SET status = ?, amount_earned = ?, commission_earned = ?, submitted_at = NOW() WHERE id = ?',
      ['completed', productCost, commission, assignmentId]
    );

    // Update task count - DO NOT automatically move to Set 2
    // User must contact customer care to reset tasks and move to Set 2
    // Note: newTasksCompleted is already calculated earlier in the function
    
    await conn.query(
      'UPDATE users SET wallet_balance = wallet_balance + ?, commission_earned = commission_earned + ?, tasks_completed_at_level = tasks_completed_at_level + 1, total_tasks_completed = total_tasks_completed + 1, tasks_completed_today = ? WHERE id = ?',
      [totalCredit, commission, newTasksCompleted, userId]
    );

    await conn.query(
      'INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "submission_credit", ?, CURDATE(), ?)',
      [userId, totalCredit, `Submitted product: ${row.name} - Refund: $${productCost.toFixed(2)} + Commission: $${commission.toFixed(2)}`]
    );

    // Pay 20% of THIS product's commission to referrer
    // This means: referrer earns 20% of every commission the referred user earns
    // So if referred user's total commission is $100, referrer will have earned $20 total over time
    const [[referrerCheck]] = await conn.query('SELECT referrer_id FROM users WHERE id = ? LIMIT 1', [userId]);
    let referralBonus = 0;
    if (referrerCheck && referrerCheck.referrer_id && commission > 0) {
      referralBonus = Number((commission * 0.20).toFixed(2)); // 20% of this product's commission
      if (referralBonus > 0) {
        await conn.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [referralBonus, referrerCheck.referrer_id]);
        await conn.query(
          'INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "referral_commission", ?, CURDATE(), ?)',
          [referrerCheck.referrer_id, referralBonus, `Referral commission (20% of $${commission.toFixed(2)}) from user #${userId}`]
        );
        console.log(`[SUBMIT] Referral bonus: $${referralBonus} paid to referrer #${referrerCheck.referrer_id}`);
      }
    }

    const [[finalUser]] = await conn.query('SELECT wallet_balance FROM users WHERE id = ? LIMIT 1', [userId]);
    const finalBalance = Number(finalUser.wallet_balance);
    console.log(`[SUBMIT] Final balance: $${finalBalance}`);

    await conn.commit();
    
    // Check if user just completed their current set (needs to contact customer care for next set)
    const justCompletedSet = (currentSet < 3 && newTasksCompleted === taskLimits.perSet);
    
    res.json({ 
      success: true,
      earned: commission,
      commission: commission,
      productCost: productCost,
      finalBalance: finalBalance,
      tasksCompletedToday: newTasksCompleted,
      currentSet: currentSet,
      tasksPerSet: taskLimits.perSet,
      totalTasksPerDay: taskLimits.total,
      setComplete: justCompletedSet,
      breakdown: {
        productCost: productCost,
        refunded: productCost,
        commission: commission,
        totalCredited: totalCredit,
        netEarnings: commission
      }
    });
  } catch (err) {
    await conn.rollback();
    console.error('[SUBMIT ERROR]', err);
    res.status(500).json({ error: 'Submission failed: ' + err.message });
  } finally {
    conn.release();
  }
});

// History endpoint and other routes continue...