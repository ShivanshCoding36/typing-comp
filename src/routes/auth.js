const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const Organizer = require('../models/Organizer');
const auth = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

// Input validation middleware
const validateRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 12, max: 100 })
    .withMessage('Password must be between 12 and 100 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character (@$!%*?&)')
];

const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign(
    { id }, 
    process.env.JWT_SECRET || 'fallback_secret_key_change_in_production',
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// REGISTER - Create new organizer account
router.post('/register', validateRegistration, handleValidationErrors, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if organizer exists (with error handling)
    let existingOrganizer;
    try {
      existingOrganizer = await Organizer.findOne({ email: email.toLowerCase() });
    } catch (dbError) {
      logger.error('Database error during organizer lookup:', dbError);
      return res.status(500).json({
        error: 'Database connection error. Please try again.'
      });
    }

    if (existingOrganizer) {
      return res.status(400).json({
        error: 'Email already registered'
      });
    }

    // Create organizer (with error handling)
    const organizer = new Organizer({
      name: name.trim(),
      email: email.toLowerCase(),
      password
    });

    try {
      await organizer.save();
    } catch (saveError) {
      logger.error('Error saving organizer:', saveError);

      // Handle specific validation errors
      if (saveError.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Invalid data provided. Please check your input.'
        });
      }

      // Handle duplicate key errors
      if (saveError.code === 11000) {
        return res.status(400).json({
          error: 'Email already registered'
        });
      }

      return res.status(500).json({
        error: 'Failed to create account. Please try again.'
      });
    }

    // Generate token (with error handling)
    let token;
    try {
      token = generateToken(organizer._id);
    } catch (tokenError) {
      logger.error('Error generating token:', tokenError);
      return res.status(500).json({
        error: 'Account created but login failed. Please try logging in.'
      });
    }

    logger.info(`✓ New organizer registered: ${email}`);

    res.status(201).json({
      success: true,
      token,
      organizer: {
        id: organizer._id,
        name: organizer.name,
        email: organizer.email
      }
    });
  } catch (error) {
    logger.error('Unexpected registration error:', error);
    res.status(500).json({
      error: 'Registration failed. Please try again.'
    });
  }
});

// LOGIN - Authenticate organizer
router.post('/login', validateLogin, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find organizer (with error handling)
    let organizer;
    try {
      organizer = await Organizer.findOne({
        email: email.toLowerCase()
      }).select('+password');
    } catch (dbError) {
      logger.error('Database error during login lookup:', dbError);
      return res.status(500).json({
        error: 'Database connection error. Please try again.'
      });
    }

    if (!organizer) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    // Check password (with error handling)
    let isPasswordValid;
    try {
      isPasswordValid = await organizer.comparePassword(password);
    } catch (passwordError) {
      logger.error('Error comparing password:', passwordError);
      return res.status(500).json({
        error: 'Authentication error. Please try again.'
      });
    }

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    // Update last login (with error handling)
    try {
      organizer.lastLogin = new Date();
      await organizer.save();
    } catch (updateError) {
      logger.warn('Failed to update last login time:', updateError);
      // Don't fail the login for this, just log it
    }

    // Generate token (with error handling)
    let token;
    try {
      token = generateToken(organizer._id);
    } catch (tokenError) {
      logger.error('Error generating login token:', tokenError);
      return res.status(500).json({
        error: 'Login successful but token generation failed. Please try again.'
      });
    }

    logger.info(`✓ Organizer logged in: ${email}`);

    res.json({
      success: true,
      token,
      organizer: {
        id: organizer._id,
        name: organizer.name,
        email: organizer.email
      }
    });
  } catch (error) {
    logger.error('Unexpected login error:', error);
    res.status(500).json({
      error: 'Login failed. Please try again.'
    });
  }
});

// GET CURRENT ORGANIZER - Get authenticated organizer info
router.get('/me', auth, async (req, res) => {
  try {
    // Find organizer (with error handling)
    let organizer;
    try {
      organizer = await Organizer.findById(req.organizer.id);
    } catch (dbError) {
      logger.error('Database error fetching organizer profile:', dbError);
      return res.status(500).json({
        error: 'Database connection error. Please try again.'
      });
    }

    if (!organizer) {
      return res.status(404).json({
        error: 'Organizer not found'
      });
    }

    res.json({
      success: true,
      organizer: {
        id: organizer._id,
        name: organizer.name,
        email: organizer.email,
        createdAt: organizer.createdAt,
        lastLogin: organizer.lastLogin
      }
    });
  } catch (error) {
    logger.error('Unexpected error fetching organizer profile:', error);
    res.status(500).json({
      error: 'Failed to get organizer info'
    });
  }
});

module.exports = router;
