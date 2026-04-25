-- Create database and users table for MySQL
CREATE DATABASE IF NOT EXISTS chatapp;
USE chatapp;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255),
  photo VARCHAR(500) DEFAULT 'https://via.placeholder.com/150',
  provider ENUM('local', 'google') DEFAULT 'local',
  isOnline BOOLEAN DEFAULT FALSE,
  lastSeen DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);