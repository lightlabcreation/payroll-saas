const Joi = require('joi');

const createJobSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  description: Joi.string().min(3).required(),
  benefits: Joi.string().optional().allow(''),
  skills: Joi.string().optional().allow(''),
  salary_min: Joi.number().min(0).optional().allow(null),
  salary_max: Joi.alternatives().try(
    Joi.number().min(Joi.ref('salary_min')),
    Joi.number().min(0)
  ).optional().allow(null).messages({ 'number.min': 'salary_max must be greater than or equal to salary_min' }),
  salary_range: Joi.alternatives().try(
    Joi.string().optional().allow(''),
    Joi.object({ min: Joi.number().min(0).required(), max: Joi.number().min(Joi.ref('min')).required() })
  ).optional().allow(null),
  location: Joi.string().max(200).optional().allow(''),
  job_type: Joi.string().valid('Full-time', 'Part-time', 'Contract', 'Internship').required(),
  department: Joi.string().max(100).optional().allow(''),
  experience: Joi.string().max(50).optional().allow(''),
  experience_required: Joi.string().max(100).optional().allow(''),
  requirements: Joi.string().optional().allow(''),
  expiry_date: Joi.date().optional().allow(null, ''),
  status: Joi.string().valid('Active', 'Closed', 'Draft').optional(),
  employer_type: Joi.string().optional().allow(''),
  is_active: Joi.boolean().optional(),
  is_featured: Joi.boolean().optional(),
});

const updateJobSchema = Joi.object({
  title: Joi.string().min(3).max(200).optional(),
  description: Joi.string().min(3).optional(),
  benefits: Joi.string().optional().allow(''),
  skills: Joi.string().optional().allow(''),
  salary_min: Joi.number().min(0).optional().allow(null),
  salary_max: Joi.alternatives().try(
    Joi.number().min(Joi.ref('salary_min')),
    Joi.number().min(0)
  ).optional().allow(null).messages({ 'number.min': 'salary_max must be greater than or equal to salary_min' }),
  salary_range: Joi.alternatives().try(
    Joi.string().optional().allow(''),
    Joi.object({ min: Joi.number().min(0).required(), max: Joi.number().min(Joi.ref('min')).required() })
  ).optional().allow(null),
  location: Joi.string().max(200).optional().allow(''),
  job_type: Joi.string().valid('Full-time', 'Part-time', 'Contract', 'Internship').optional(),
  department: Joi.string().max(100).optional().allow(''),
  experience: Joi.string().max(50).optional().allow(''),
  experience_required: Joi.string().max(100).optional().allow(''),
  requirements: Joi.string().optional().allow(''),
  expiry_date: Joi.date().optional().allow(null, ''),
  status: Joi.string().valid('Active', 'Closed', 'Draft').optional(),
  employer_type: Joi.string().optional().allow(''),
  is_active: Joi.boolean().optional(),
  is_featured: Joi.boolean().optional(),
});

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false, convert: true });
    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors,
      });
    }
    next();
  };
};

module.exports = {
  validateCreateJob: validate(createJobSchema),
  validateUpdateJob: validate(updateJobSchema),
};

