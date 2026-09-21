-- Fix employer_id missing column issue
-- Run this in MySQL Workbench or command line

USE pop_db;

-- Check if employees table exists
SELECT 'Checking employees table...' as status;

-- Add employer_id column if it doesn't exist
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS employer_id INT AFTER id;

-- Add company_id column if it doesn't exist (some queries might use this)
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS company_id INT AFTER employer_id;

-- Drop old foreign keys if they exist
ALTER TABLE employees DROP FOREIGN KEY IF EXISTS fk_employee_employer;
ALTER TABLE employees DROP FOREIGN KEY IF EXISTS fk_employee_company;

-- Add foreign key for employer_id
ALTER TABLE employees
ADD CONSTRAINT fk_employee_employer 
FOREIGN KEY (employer_id) REFERENCES companies(id) ON DELETE CASCADE;

-- Add foreign key for company_id (if needed)
ALTER TABLE employees
ADD CONSTRAINT fk_employee_company 
FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- Show the updated structure
SELECT 'Updated employees table structure:' as status;
DESCRIBE employees;

-- Check if any employees exist
SELECT 'Current employee count:' as status, COUNT(*) as count FROM employees;

SELECT '✅ Schema fix completed!' as status;
