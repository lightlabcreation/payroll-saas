-- Fix any potential schema issues with job_applications table
-- This script ensures the column name is 'jobseeker_id' not 'job_seeker_id'

-- Check current schema
SHOW COLUMNS FROM job_applications;

-- If you see 'job_seeker_id', run this to rename it:
-- ALTER TABLE job_applications CHANGE COLUMN job_seeker_id jobseeker_id INT(11);

-- Verify the change
-- SHOW COLUMNS FROM job_applications;
