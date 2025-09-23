import express from 'express';
import { z } from 'zod';
import { verifyJWT, JWTPayload, getEnv, logger } from '@vitrinealu/shared';
import { createAdapterFactoryFromEnv, AdapterFactory, AssembleJob } from '@vitrinealu/video-assembler';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

const router = express.Router();

// Authentication middleware
const authenticateEditor = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.substring(7);
    // Get secret for JWT verification
    let secret: string;
    try {
      const env = getEnv();
      secret = env.WEBHOOK_SIGNING_SECRET || 'default-secret-change-in-prod';
    } catch {
      // For testing, use a test secret
      secret = 'test-secret-key';
    }

    const decoded = verifyJWT(token, secret);

    if (decoded.role !== 'editor') {
      return res.status(403).json({ error: 'Editor role required' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    logger.error({ err: error }, 'Authentication error');
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Video generation schema
const VideoGenerationSchema = z.object({
  profile: z.enum(['reel', 'square', 'landscape']).default('reel'),
  clips: z.array(z.object({
    image: z.string(),
    durationSec: z.number().min(0.1).max(30),
    caption: z.string().optional(),
    pan: z.enum(['none', 'leftToRight', 'rightToLeft', 'topToBottom', 'bottomToTop']).optional().default('none'),
    zoom: z.enum(['none', 'in', 'out']).optional().default('none'),
  })),
  adapter: z.enum(['ffmpeg', 'capcut', 'runway']).optional(),
  seed: z.number().optional(),
  enableFallback: z.boolean().default(true),
});

type VideoGenerationRequest = z.infer<typeof VideoGenerationSchema>;

// Initialize adapter factory
let adapterFactory: AdapterFactory;
try {
  adapterFactory = createAdapterFactoryFromEnv();
} catch (error) {
  logger.error({ err: error }, 'Failed to initialize adapter factory');
  throw error;
}

// POST /api/video/generate - Generate video using adapters
router.post('/generate', authenticateEditor, async (req, res) => {
  try {
    const request = VideoGenerationSchema.parse(req.body);

    // Validate clips
    if (request.clips.length === 0) {
      return res.status(400).json({ error: 'At least one clip is required' });
    }

    if (request.clips.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 clips allowed' });
    }

    // Create assemble job from request
    const assembleJob: AssembleJob = {
      profile: request.profile === 'reel' ? 'reel' : 'linkedin', // Map API profiles to assembler profiles
      clips: request.clips.map(clip => ({
        image: clip.image,
        durationSec: clip.durationSec,
        pan: clip.pan === 'leftToRight' ? 'ltr' : 
             clip.pan === 'rightToLeft' ? 'rtl' : 'center',
        zoom: clip.zoom || 'none',
      })),
      outPath: `/tmp/video_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`,
      seed: request.seed || Math.floor(Math.random() * 10000),
      adapter: request.adapter,
    };

    // Generate video using adapter system
    logger.info({ 
      msg: 'Starting video generation',
      profile: request.profile,
      clipCount: request.clips.length,
      requestedAdapter: request.adapter,
      enableFallback: request.enableFallback
    });

    const result = await adapterFactory.generateVideo(
      assembleJob,
      request.adapter
    );

    logger.info({
      msg: 'Video generation completed',
      adapter: result.metadata.adapter,
      duration: result.metadata.duration,
      outputPath: result.outputPath
    });

    res.json({
      success: true,
      video: {
        adapter: result.metadata.adapter,
        outputPath: result.outputPath,
        duration: result.metadata.duration,
        profile: request.profile,
        clipCount: request.clips.length,
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        seed: assembleJob.seed,
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }

    logger.error({ err: error }, 'Video generation failed');
    
    // Handle adapter-specific errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage?.includes('API key')) {
      return res.status(500).json({ error: 'Video service configuration error' });
    }
    
    if (errorMessage?.includes('quota') || errorMessage?.includes('limit')) {
      return res.status(429).json({ error: 'Video generation quota exceeded' });
    }

    res.status(500).json({ error: 'Video generation failed' });
  }
});

// GET /api/video/adapters - Get available adapters
router.get('/adapters', authenticateEditor, async (req, res) => {
  try {
    const availableAdapters = await adapterFactory.getAvailableAdapters();
    
    res.json({
      adapters: availableAdapters,
      default: adapterFactory.config.defaultAdapter,
      fallbackOrder: adapterFactory.config.fallbackOrder,
      fallbackEnabled: adapterFactory.config.enableFallback,
    });

  } catch (error) {
    logger.error({ err: error }, 'Failed to get available adapters');
    res.status(500).json({ error: 'Failed to get adapter information' });
  }
});

// POST /api/video/adapters/clear-cache - Clear adapter availability cache
router.post('/adapters/clear-cache', authenticateEditor, async (req, res) => {
  try {
    adapterFactory.clearAvailabilityCache();
    
    res.json({
      success: true,
      message: 'Adapter availability cache cleared'
    });

  } catch (error) {
    logger.error({ err: error }, 'Failed to clear adapter cache');
    res.status(500).json({ error: 'Failed to clear adapter cache' });
  }
});

export { router as videoRoutes };