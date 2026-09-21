const express = require('express');
const router = express.Router();
const jobseekerController = require('../controllers/jobseeker.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');

// All routes require authentication and 'jobseeker' role
router.use(authenticate);
router.use(authorize('jobseeker', 'employee', 'employer'));

// Dashboard & Jobs
router.get('/dashboard', jobseekerController.getDashboardJobs);
router.get('/stats', jobseekerController.getStatsDashboard);
router.get('/jobs/:id', jobseekerController.getJobDetails);

// Resume
router.post('/resume', upload.single('file'), jobseekerController.submitResume);
router.get('/resume', jobseekerController.getMyResumes);

// Applications
router.post('/apply/:jobId', jobseekerController.applyJob);
router.get('/applications', jobseekerController.getAppliedJobs);
router.put('/applications/:id/withdraw', jobseekerController.withdrawApplication);

// Profile
router.get('/profile', jobseekerController.getProfile);
router.put('/profile', jobseekerController.updateProfile);

// Skills
router.post('/skills', jobseekerController.addSkill);
router.delete('/skills/:id', jobseekerController.deleteSkill);

// Experience
router.post('/experience', jobseekerController.addExperience);
router.delete('/experience/:id', jobseekerController.deleteExperience);

// Education
router.post('/education', jobseekerController.addEducation);
router.delete('/education/:id', jobseekerController.deleteEducation);

module.exports = router;
