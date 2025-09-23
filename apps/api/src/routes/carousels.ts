import express from 'express';
import { z } from 'zod';
import { verifyJWT, JWTPayload, getEnv, logger } from '@vitrinealu/shared';

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

// Carousel preview schema
const CarouselPreviewSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  mediaItems: z.array(z.object({
    id: z.string(),
    type: z.enum(['image', 'video']),
    url: z.string(),
    caption: z.string().optional(),
    alt: z.string().optional()
  })),
  scheduledDate: z.string().optional(),
  status: z.enum(['draft', 'pending_approval', 'approved', 'scheduled']),
  createdAt: z.string(),
  updatedAt: z.string()
});

type CarouselPreview = z.infer<typeof CarouselPreviewSchema>;

// Mock data - in real implementation, this would come from database/service
const getMockCarousels = (): CarouselPreview[] => [
  {
    id: 'carousel-1',
    title: 'Summer Collection Preview',
    description: 'New summer fashion items',
    mediaItems: [
      {
        id: 'media-1',
        type: 'image' as const,
        url: 'https://example.com/image1.jpg',
        caption: 'Beautiful summer dress',
        alt: 'Summer dress on model'
      }
    ],
    scheduledDate: '2024-07-15T10:00:00Z',
    status: 'pending_approval' as const,
    createdAt: '2024-07-10T09:00:00Z',
    updatedAt: '2024-07-10T09:00:00Z'
  },
  {
    id: 'carousel-2',
    title: 'Winter Collection Preview',
    description: 'New winter fashion items',
    mediaItems: [
      {
        id: 'media-2',
        type: 'image' as const,
        url: 'https://example.com/image2.jpg',
        caption: 'Beautiful winter coat',
        alt: 'Winter coat on model'
      }
    ],
    scheduledDate: '2024-12-15T10:00:00Z',
    status: 'pending_approval' as const,
    createdAt: '2024-12-10T09:00:00Z',
    updatedAt: '2024-12-10T09:00:00Z'
  }
];

const mockCarousels = getMockCarousels();

// GET /api/carousels/preview - Get carousels pending approval
router.get('/preview', authenticateEditor, async (req, res) => {
  try {
    // In real implementation, fetch from database/service
    const pendingCarousels = mockCarousels.filter(c => c.status === 'pending_approval');

    res.json({
      carousels: pendingCarousels,
      total: pendingCarousels.length
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching carousel previews');
    res.status(500).json({ error: 'Failed to fetch carousel previews' });
  }
});

// POST /api/carousels/approve - Approve or reject a carousel
router.post('/approve', authenticateEditor, async (req, res) => {
  try {
    const approvalSchema = z.object({
      carouselId: z.string(),
      action: z.enum(['approve', 'reject']),
      comments: z.string().optional()
    });

    const { carouselId, action, comments } = approvalSchema.parse(req.body);

    // In real implementation, update database and trigger scheduling
    const carousel = mockCarousels.find(c => c.id === carouselId);
    if (!carousel) {
      return res.status(404).json({ error: 'Carousel not found' });
    }

    if (carousel.status !== 'pending_approval') {
      return res.status(400).json({ error: 'Carousel is not pending approval' });
    }

    // Update status
    carousel.status = action === 'approve' ? 'approved' : 'draft';
    carousel.updatedAt = new Date().toISOString();

    // In real implementation, trigger scheduling workflow if approved
    if (action === 'approve') {
      // TODO: Integrate with WeeklyPlanner/CarouselBuilder
      logger.info(`Carousel ${carouselId} approved for scheduling`);
    }

    res.json({
      success: true,
      carousel: {
        id: carousel.id,
        status: carousel.status,
        action,
        comments
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }

    logger.error({ err: error }, 'Error approving carousel');
    res.status(500).json({ error: 'Failed to approve carousel' });
  }
});

export { router as carouselRoutes };