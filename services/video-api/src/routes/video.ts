import { Router } from 'express';
import { createReel } from '../controllers/reel';
import { createLinkedIn } from '../controllers/linkedin';
import { validateVideoRequest } from '../validators';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting for video creation endpoints
const createVideoLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    error: 'Too Many Requests',
    message: 'Too many video creation requests from this IP, please try again later.',
    timestamp: new Date().toISOString(),
    statusCode: 429,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /video/reel
 * Create a 9:16 aspect ratio video for Reels/TikTok/Shorts
 */
router.post('/reel', createVideoLimit, validateVideoRequest, createReel);

/**
 * POST /video/linkedin
 * Create a 16:9 aspect ratio video for LinkedIn
 */
router.post('/linkedin', createVideoLimit, validateVideoRequest, createLinkedIn);

/**
 * GET /video/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'video-api',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

export default router;