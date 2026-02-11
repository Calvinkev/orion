/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-11.4.5-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: orion_db
-- ------------------------------------------------------
-- Server version	11.4.5-MariaDB-1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Table structure for table `albums`
--

DROP TABLE IF EXISTS `albums`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `albums` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `artist` varchar(255) DEFAULT NULL,
  `image_path` varchar(500) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `level1_price` decimal(12,2) DEFAULT 100.00,
  `level2_price` decimal(12,2) DEFAULT 200.00,
  `level3_price` decimal(12,2) DEFAULT 300.00,
  `level4_price` decimal(12,2) DEFAULT 400.00,
  `level5_price` decimal(12,2) DEFAULT 500.00,
  `level1_commission` decimal(12,2) DEFAULT 0.00,
  `level2_commission` decimal(12,2) DEFAULT 0.00,
  `level3_commission` decimal(12,2) DEFAULT 0.00,
  `level4_commission` decimal(12,2) DEFAULT 0.00,
  `level5_commission` decimal(12,2) DEFAULT 0.00,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `albums`
--

LOCK TABLES `albums` WRITE;
/*!40000 ALTER TABLE `albums` DISABLE KEYS */;
/*!40000 ALTER TABLE `albums` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `balance_events`
--

DROP TABLE IF EXISTS `balance_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `balance_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `type` enum('assignment_debit','submission_credit','manual_adjustment','deposit','referral_commission','assignment_refund') NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `reference_date` date DEFAULT NULL,
  `details` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `type` (`type`),
  KEY `reference_date` (`reference_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `balance_events`
--

LOCK TABLES `balance_events` WRITE;
/*!40000 ALTER TABLE `balance_events` DISABLE KEYS */;
/*!40000 ALTER TABLE `balance_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `chat_messages`
--

DROP TABLE IF EXISTS `chat_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `message` text NOT NULL,
  `sender_type` enum('user','admin') NOT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `image_path` varchar(500) DEFAULT NULL,
  `hidden_from_admin` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `sender_type` (`sender_type`),
  KEY `is_read` (`is_read`),
  KEY `created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chat_messages`
--

LOCK TABLES `chat_messages` WRITE;
/*!40000 ALTER TABLE `chat_messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `chat_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `commission_rates`
--

DROP TABLE IF EXISTS `commission_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `commission_rates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `level` int(11) NOT NULL,
  `rate` decimal(5,4) DEFAULT 0.0050,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `level` (`level`),
  KEY `idx_level` (`level`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `commission_rates`
--

LOCK TABLES `commission_rates` WRITE;
/*!40000 ALTER TABLE `commission_rates` DISABLE KEYS */;
INSERT INTO `commission_rates` VALUES
(1,1,0.0050,'2026-01-23 14:50:59'),
(2,2,0.0100,'2026-01-23 14:50:59'),
(3,3,0.0150,'2026-01-23 14:50:59'),
(4,4,0.0200,'2026-01-23 14:50:59'),
(5,5,0.0250,'2026-01-23 14:50:59');
/*!40000 ALTER TABLE `commission_rates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `deposits`
--

DROP TABLE IF EXISTS `deposits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `deposits` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `description` varchar(255) DEFAULT 'Account deposit',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `deposits`
--

LOCK TABLES `deposits` WRITE;
/*!40000 ALTER TABLE `deposits` DISABLE KEYS */;
/*!40000 ALTER TABLE `deposits` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `events`
--

DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `image_path` varchar(500) DEFAULT NULL,
  `event_date` date DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `is_active` (`is_active`),
  KEY `event_date` (`event_date`),
  KEY `created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `events`
--

LOCK TABLES `events` WRITE;
/*!40000 ALTER TABLE `events` DISABLE KEYS */;
/*!40000 ALTER TABLE `events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `global_popup_dismissals`
--

DROP TABLE IF EXISTS `global_popup_dismissals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `global_popup_dismissals` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `global_popup_id` int(11) NOT NULL,
  `dismissed_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_popup` (`user_id`,`global_popup_id`),
  KEY `user_id` (`user_id`),
  KEY `global_popup_id` (`global_popup_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `global_popup_dismissals`
--

LOCK TABLES `global_popup_dismissals` WRITE;
/*!40000 ALTER TABLE `global_popup_dismissals` DISABLE KEYS */;
/*!40000 ALTER TABLE `global_popup_dismissals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `global_popups`
--

DROP TABLE IF EXISTS `global_popups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `global_popups` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `voucher_id` int(11) DEFAULT NULL,
  `title` varchar(150) NOT NULL,
  `message` text NOT NULL,
  `image_path` varchar(500) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `is_active` (`is_active`),
  KEY `created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `global_popups`
--

LOCK TABLES `global_popups` WRITE;
/*!40000 ALTER TABLE `global_popups` DISABLE KEYS */;
/*!40000 ALTER TABLE `global_popups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `level_settings`
--

DROP TABLE IF EXISTS `level_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `level_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `level` int(11) NOT NULL,
  `daily_task_limit` int(11) DEFAULT 80,
  `total_tasks_required` int(11) DEFAULT 0,
  `min_withdrawal_balance` decimal(12,2) DEFAULT 100.00,
  `max_withdrawal_amount` decimal(12,2) DEFAULT 5000.00,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `level` (`level`),
  KEY `idx_level` (`level`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `level_settings`
--

LOCK TABLES `level_settings` WRITE;
/*!40000 ALTER TABLE `level_settings` DISABLE KEYS */;
INSERT INTO `level_settings` VALUES
(1,1,80,0,100.00,5000.00,'2026-01-23 14:51:00'),
(2,2,90,200,500.00,10000.00,'2026-01-23 14:51:00'),
(3,3,100,500,1500.00,20000.00,'2026-01-23 14:51:00'),
(4,4,110,1000,5000.00,50000.00,'2026-01-23 14:51:00'),
(5,5,120,2000,10000.00,100000.00,'2026-01-23 14:51:00');
/*!40000 ALTER TABLE `level_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `title` varchar(150) NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `is_read` (`is_read`),
  KEY `created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `popups`
--

DROP TABLE IF EXISTS `popups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `popups` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `title` varchar(150) NOT NULL,
  `message` text NOT NULL,
  `url` varchar(500) DEFAULT NULL,
  `image_path` varchar(500) DEFAULT NULL,
  `status` enum('pending','clicked','dismissed') DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `clicked_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `status` (`status`),
  KEY `created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `popups`
--

LOCK TABLES `popups` WRITE;
/*!40000 ALTER TABLE `popups` DISABLE KEYS */;
/*!40000 ALTER TABLE `popups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `artist` varchar(255) DEFAULT NULL,
  `image_path` varchar(500) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `level1_price` decimal(12,2) DEFAULT 100.00,
  `level2_price` decimal(12,2) DEFAULT 200.00,
  `level3_price` decimal(12,2) DEFAULT 300.00,
  `level4_price` decimal(12,2) DEFAULT 400.00,
  `level5_price` decimal(12,2) DEFAULT 500.00,
  `level1_commission` decimal(12,2) DEFAULT 0.00,
  `level2_commission` decimal(12,2) DEFAULT 0.00,
  `level3_commission` decimal(12,2) DEFAULT 0.00,
  `level4_commission` decimal(12,2) DEFAULT 0.00,
  `level5_commission` decimal(12,2) DEFAULT 0.00,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_albums`
--

DROP TABLE IF EXISTS `user_albums`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_albums` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `album_id` int(11) NOT NULL,
  `assigned_date` date DEFAULT NULL,
  `status` enum('pending','in_progress','completed') DEFAULT 'pending',
  `amount_earned` decimal(12,2) DEFAULT 0.00,
  `commission_earned` decimal(12,2) DEFAULT 0.00,
  `manual_bonus` decimal(12,2) DEFAULT 0.00,
  `custom_price` decimal(12,2) DEFAULT NULL,
  `is_manual` tinyint(1) DEFAULT 0,
  `balance_before_start` decimal(12,2) DEFAULT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_album_id` (`album_id`),
  KEY `idx_status` (`status`),
  KEY `idx_assigned_date` (`assigned_date`),
  CONSTRAINT `user_albums_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_albums_ibfk_2` FOREIGN KEY (`album_id`) REFERENCES `albums` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_albums`
--

LOCK TABLES `user_albums` WRITE;
/*!40000 ALTER TABLE `user_albums` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_albums` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_products`
--

DROP TABLE IF EXISTS `user_products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `assigned_date` date DEFAULT NULL,
  `status` enum('pending','in_progress','completed') DEFAULT 'pending',
  `amount_earned` decimal(12,2) DEFAULT 0.00,
  `commission_earned` decimal(12,2) DEFAULT 0.00,
  `manual_bonus` decimal(12,2) DEFAULT 0.00,
  `custom_price` decimal(12,2) DEFAULT NULL,
  `is_manual` tinyint(1) DEFAULT 0,
  `balance_before_start` decimal(12,2) DEFAULT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_product_id` (`product_id`),
  KEY `idx_status` (`status`),
  KEY `idx_assigned_date` (`assigned_date`),
  CONSTRAINT `user_products_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_products_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_products`
--

LOCK TABLES `user_products` WRITE;
/*!40000 ALTER TABLE `user_products` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `withdraw_password` varchar(255) DEFAULT NULL,
  `wallet_balance` decimal(15,2) DEFAULT 0.00,
  `commission_earned` decimal(15,2) DEFAULT 0.00,
  `level` int(11) DEFAULT 1,
  `status` enum('active','suspended','banned') DEFAULT 'active',
  `is_admin` tinyint(1) DEFAULT 0,
  `invite_code` varchar(20) DEFAULT NULL,
  `invitation_code` varchar(50) DEFAULT NULL,
  `referrer_id` int(11) DEFAULT NULL,
  `first_deposit_bonus_paid` tinyint(1) DEFAULT 0,
  `profile_picture` varchar(500) DEFAULT NULL,
  `current_set` int(11) DEFAULT 1,
  `tasks_completed_today` int(11) DEFAULT 0,
  `last_task_reset_date` date DEFAULT NULL,
  `credit_score` int(11) DEFAULT 100,
  `withdraw_type` varchar(50) DEFAULT NULL,
  `saved_wallet_address` varchar(255) DEFAULT NULL,
  `registration_bonus_shown` tinyint(1) DEFAULT 0,
  `negative_balance_set` int(11) DEFAULT NULL,
  `negative_balance_submission` int(11) DEFAULT NULL,
  `negative_balance_amount` decimal(12,2) DEFAULT NULL,
  `negative_balance_triggered` tinyint(1) DEFAULT 0,
  `balance_before_negative` decimal(12,2) DEFAULT NULL,
  `negative_trigger_product_price` decimal(12,2) DEFAULT NULL,
  `pending_balance_restoration` tinyint(1) DEFAULT 0,
  `last_seen` datetime DEFAULT NULL,
  `last_login` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `total_tasks_completed` int(11) DEFAULT 0,
  `tasks_completed_at_level` int(11) DEFAULT 0,
  `daily_streak` int(11) DEFAULT 0,
  `last_streak_date` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `invite_code` (`invite_code`),
  KEY `idx_username` (`username`),
  KEY `idx_email` (`email`),
  KEY `idx_status` (`status`),
  KEY `idx_invite_code` (`invite_code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES
(1,'admin','admin@orion.com',NULL,'$2b$10$qdtONJGy/2zO6ngPjjPJKOddF4x5UTQbNtLYWUS2WQ.NVdqZC2KUu',NULL,0.00,0.00,1,'active',1,NULL,NULL,NULL,0,NULL,1,0,NULL,100,NULL,NULL,0,NULL,NULL,NULL,0,NULL,NULL,0,NULL,'2026-02-04 13:49:59','2026-01-23 14:51:23',0,0,0,NULL),
(2,'demo','demo@orion.com',NULL,'$2b$10$sc1enLlaNiD21GSAdAdkxeHfHT52HPO9Goq0iSbvFESCkPoudmKca',NULL,809.00,54.00,2,'active',0,NULL,NULL,NULL,0,'/backend/uploads/profilepictures/1769285384874-1767072769371(6).jpg',1,1,'2026-02-11',100,NULL,NULL,1,NULL,NULL,NULL,0,NULL,NULL,0,'2026-02-11 02:28:18','2026-02-11 01:47:27','2026-01-23 18:40:17',57,57,0,NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vouchers`
--

DROP TABLE IF EXISTS `vouchers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vouchers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `title` varchar(150) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `image_path` varchar(500) NOT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `status` (`status`),
  KEY `created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vouchers`
--

LOCK TABLES `vouchers` WRITE;
/*!40000 ALTER TABLE `vouchers` DISABLE KEYS */;
/*!40000 ALTER TABLE `vouchers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `withdraw_password_otps`
--

DROP TABLE IF EXISTS `withdraw_password_otps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `withdraw_password_otps` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `otp_code` varchar(10) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `otp_code` (`otp_code`),
  KEY `expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `withdraw_password_otps`
--

LOCK TABLES `withdraw_password_otps` WRITE;
/*!40000 ALTER TABLE `withdraw_password_otps` DISABLE KEYS */;
/*!40000 ALTER TABLE `withdraw_password_otps` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `withdrawal_requests`
--

DROP TABLE IF EXISTS `withdrawal_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `withdrawal_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `username` varchar(100) NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `wallet_address` varchar(255) NOT NULL,
  `withdraw_type` varchar(50) DEFAULT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `admin_note` text DEFAULT NULL,
  `requested_at` timestamp NULL DEFAULT current_timestamp(),
  `processed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `status` (`status`),
  KEY `created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `withdrawal_requests`
--

LOCK TABLES `withdrawal_requests` WRITE;
/*!40000 ALTER TABLE `withdrawal_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `withdrawal_requests` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-02-11  2:28:18
