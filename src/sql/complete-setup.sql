-- Complete Database Setup Script
-- Run this to initialize all tables

USE pop_db;

SET FOREIGN_KEY_CHECKS = 0;

-- Drop existing tables if they exist (to avoid conflicts)
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS company_requests;
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS employers;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS users;

-- Create users table
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(30),
  password VARCHAR(255) NOT NULL,
  role ENUM('superadmin', 'admin', 'employer', 'employee', 'vendor', 'jobseeker') NOT NULL DEFAULT 'jobseeker',
  company_id INT,
  status ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
  last_login DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email)
);

-- Create employers table
CREATE TABLE employers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  company_name VARCHAR(200) NOT NULL,
  company_address TEXT,
  website VARCHAR(200),
  gst_number VARCHAR(50),
  pan_number VARCHAR(50),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employer_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Add foreign key to users table
ALTER TABLE users ADD CONSTRAINT fk_user_company FOREIGN KEY (company_id) REFERENCES employers(id) ON DELETE SET NULL;

-- Create admins table
CREATE TABLE admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    department VARCHAR(100),
    created_by INT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_admin_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_admin_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create plans table
CREATE TABLE plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  duration_months INT NOT NULL DEFAULT 1,
  description TEXT,
  features TEXT,
  max_employees INT,
  max_jobs INT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create company_requests table
CREATE TABLE company_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(200) NOT NULL,
  contact_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone VARCHAR(30),
  plan_id INT NOT NULL,
  payment_status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
  request_status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
  company_address TEXT,
  gst_number VARCHAR(50),
  pan_number VARCHAR(50),
  notes TEXT,
  processed_by INT,
  processed_at DATETIME,
  created_company_id INT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_req_plan FOREIGN KEY (plan_id) REFERENCES plans(id),
  CONSTRAINT fk_req_processor FOREIGN KEY (processed_by) REFERENCES users(id),
  CONSTRAINT fk_req_company FOREIGN KEY (created_company_id) REFERENCES employers(id)
);

-- Create subscriptions table
CREATE TABLE subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employer_id INT NOT NULL,
  plan_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('active', 'expired', 'cancelled', 'pending') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sub_employer FOREIGN KEY (employer_id) REFERENCES employers(id),
  CONSTRAINT fk_sub_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
);

-- Create audit_logs table
CREATE TABLE audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(255) NOT NULL,
  details TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SET FOREIGN_KEY_CHECKS = 1;

-- Insert sample plans
INSERT INTO plans (name, price, duration_months, description, features, max_employees, max_jobs, is_active) VALUES
('Basic', 999.00, 1, 'Perfect for small businesses', '["Basic payroll", "Up to 10 employees", "Email support"]', 10, 5, TRUE),
('Professional', 2999.00, 1, 'For growing companies', '["Advanced payroll", "Up to 50 employees", "Priority support", "Reports"]', 50, 20, TRUE),
('Enterprise', 9999.00, 1, 'For large organizations', '["Full payroll suite", "Unlimited employees", "24/7 support", "Custom reports", "API access"]', NULL, NULL, TRUE);

-- Insert superadmin user (password: Admin@123)
INSERT INTO users (name, email, phone, password, role, status) VALUES
('Super Admin', 'superadmin@gmail.com', '9999999999', '$2b$10$3IIFrQMfMxyubZx9KNzLy7ie.jXPLs6HAP5ULvsXRVuuFK', 'superadmin', 'active');

SELECT 'Database setup completed successfully!' AS message;
