import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';

// Schema definitions
const PendingPostsResponse = z.object({
  posts: z.array(z.object({
    id: z.string(),
    assetId: z.string(),
    platform: z.string(),
    caption: z.string(),
    hashtags: z.array(z.string()),
    mediaPath: z.string(),
    thumbnailPath: z.string().optional(),
    scheduleSlot: z.string(),
    createdAt: z.string(),
    status: z.string()
  }))
});

const GenerateDigestRequest = z.object({
  posts: z.array(z.any()),
  weekStart: z.string()
});

const DigestLogRequest = z.object({
  digestId: z.string().nullable(),
  postsCount: z.number(),
  sentAt: z.string(),
  recipient: z.string().optional(),
  message: z.string().optional()
});

// HMAC signing function
function signApprovalLink(postId: string, action: 'approve' | 'reject', secret: string): string {
  const payload = { postId, action, timestamp: Date.now() };
  const payloadStr = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
  return `${Buffer.from(payloadStr).toString('base64')}.${signature}`;
}

// Generate HTML digest template
function generateDigestHTML(posts: any[], baseUrl: string, secret: string): string {
  const approveAllLink = `${baseUrl}/api/approve-all?token=${signApprovalLink('all', 'approve', secret)}`;
  
  const postsHTML = posts.map(post => {
    const approveLink = `${baseUrl}/api/approve?token=${signApprovalLink(post.id, 'approve', secret)}`;
    const rejectLink = `${baseUrl}/api/approve?token=${signApprovalLink(post.id, 'reject', secret)}`;
    
    return `
      <div style="margin-bottom: 40px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h3 style="color: #0C2436; margin: 0;">${post.platform.toUpperCase()}</h3>
          <span style="color: #666; font-size: 14px;">${post.scheduleSlot}</span>
        </div>
        
        ${post.thumbnailPath ? `
          <img src="${post.thumbnailPath}" alt="Preview" style="max-width: 200px; max-height: 200px; border-radius: 4px; margin-bottom: 15px;">
        ` : ''}
        
        <div style="margin-bottom: 15px;">
          <p style="margin: 0; line-height: 1.5;">${post.caption}</p>
          <div style="margin-top: 8px;">
            ${post.hashtags.map((tag: string) => `<span style="color: #1274B7; margin-right: 8px;">${tag}</span>`).join('')}
          </div>
        </div>
        
        <div style="margin-top: 20px;">
          <a href="${approveLink}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin-right: 10px;">✓ Approve</a>
          <a href="${rejectLink}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">✗ Reject</a>
        </div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>VitrineAlu Weekly Content Approval</title>
      <style>
        body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background-color: #0C2436; color: white; padding: 30px; text-align: center; border-radius: 8px; margin-bottom: 30px; }
        .footer { margin-top: 40px; padding: 20px; background-color: #f8f9fa; border-radius: 8px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>VitrineAlu Weekly Content Approval</h1>
        <p>Review and approve this week's social media content</p>
        <div style="margin-top: 20px;">
          <a href="${approveAllLink}" style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">✓ APPROVE ALL</a>
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h2>Posts for Approval (${posts.length})</h2>
        ${postsHTML}
      </div>
      
      <div class="footer">
        <p><strong>VitrineAlu Marketing Automation</strong></p>
        <p>Generated on ${new Date().toLocaleDateString()}</p>
      </div>
    </body>
    </html>
  `;
}

export const registerDigestRoutes = async (app: FastifyInstance) => {
  // Get pending posts for digest
  app.get('/digest/pending', async (request, reply) => {
    try {
      // In a real implementation, this would query the database
      // For now, return mock data that matches the expected structure
      const posts = [
        {
          id: 'post-1',
          assetId: 'asset-123',
          platform: 'instagram_reel',
          caption: 'Beautiful aluminum installation bringing natural light into modern living spaces ✨',
          hashtags: ['#VitrineAlu', '#ModernLiving', '#NaturalLight', '#AluminumDesign', '#InteriorDesign'],
          mediaPath: '/assets/renders/asset-123/vertical.mp4',
          thumbnailPath: '/assets/renders/asset-123/thumbnail.jpg',
          scheduleSlot: 'mon_reel',
          createdAt: new Date().toISOString(),
          status: 'AWAITING_APPROVAL'
        }
      ];

      return reply.send({ posts });
    } catch (error) {
      app.log.error('Failed to get pending posts:', error);
      return reply.status(500).send({ error: 'Failed to get pending posts' });
    }
  });

  // Generate digest HTML
  app.post('/digest/generate', async (request, reply) => {
    try {
      const { posts, weekStart } = GenerateDigestRequest.parse(request.body);
      
      const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
      const secret = process.env.APPROVAL_HMAC_SECRET || 'default-secret';
      
      const html = generateDigestHTML(posts, baseUrl, secret);
      const digestId = crypto.randomUUID();
      
      return reply.send({ 
        html, 
        digestId,
        postsCount: posts.length,
        weekStart 
      });
    } catch (error) {
      app.log.error('Failed to generate digest:', error);
      return reply.status(500).send({ error: 'Failed to generate digest' });
    }
  });

  // Log digest activity
  app.post('/digest/log', async (request, reply) => {
    try {
      const logData = DigestLogRequest.parse(request.body);
      
      // In a real implementation, this would save to database
      app.log.info('Digest activity logged:', logData);
      
      return reply.send({ logged: true });
    } catch (error) {
      app.log.error('Failed to log digest activity:', error);
      return reply.status(500).send({ error: 'Failed to log digest activity' });
    }
  });

  // Approve/reject individual posts
  app.get('/approve', async (request, reply) => {
    try {
      const { token } = request.query as { token: string };
      
      if (!token) {
        return reply.status(400).send({ error: 'Missing approval token' });
      }

      // Parse and verify token
      const [payloadB64, signature] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
      
      const secret = process.env.APPROVAL_HMAC_SECRET || 'default-secret';
      const expectedSignature = crypto.createHmac('sha256', secret)
        .update(Buffer.from(payloadB64, 'base64').toString())
        .digest('hex');
      
      if (signature !== expectedSignature) {
        return reply.status(400).send({ error: 'Invalid approval token' });
      }

      // Check if token is expired (24 hours)
      if (Date.now() - payload.timestamp > 24 * 60 * 60 * 1000) {
        return reply.status(400).send({ error: 'Approval token expired' });
      }

      // Process approval/rejection
      const { postId, action } = payload;
      
      // In a real implementation, this would update the database
      app.log.info(`Post ${postId} ${action}d`);
      
      return reply.type('text/html').send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px;">
            <h1>✓ Success</h1>
            <p>Post ${postId} has been ${action}d successfully.</p>
            <p style="color: #666;">You can now close this window.</p>
          </body>
        </html>
      `);
    } catch (error) {
      app.log.error('Failed to process approval:', error);
      return reply.status(500).send({ error: 'Failed to process approval' });
    }
  });

  // Approve all posts
  app.get('/approve-all', async (request, reply) => {
    try {
      const { token } = request.query as { token: string };
      
      if (!token) {
        return reply.status(400).send({ error: 'Missing approval token' });
      }

      // Similar token verification as above
      const [payloadB64, signature] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
      
      const secret = process.env.APPROVAL_HMAC_SECRET || 'default-secret';
      const expectedSignature = crypto.createHmac('sha256', secret)
        .update(Buffer.from(payloadB64, 'base64').toString())
        .digest('hex');
      
      if (signature !== expectedSignature) {
        return reply.status(400).send({ error: 'Invalid approval token' });
      }

      if (Date.now() - payload.timestamp > 24 * 60 * 60 * 1000) {
        return reply.status(400).send({ error: 'Approval token expired' });
      }

      // In a real implementation, this would approve all pending posts
      app.log.info('All pending posts approved');
      
      return reply.type('text/html').send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px;">
            <h1>✓ All Posts Approved</h1>
            <p>All pending posts have been approved and will be published according to schedule.</p>
            <p style="color: #666;">You can now close this window.</p>
          </body>
        </html>
      `);
    } catch (error) {
      app.log.error('Failed to approve all posts:', error);
      return reply.status(500).send({ error: 'Failed to approve all posts' });
    }
  });

  // Notification endpoints for workflow status
  app.post('/notify/success', async (request, reply) => {
    try {
      const { assetId, fileName, postsCreated, timestamp } = request.body as any;
      
      app.log.info('Asset processing completed successfully:', {
        assetId,
        fileName,
        postsCreated,
        timestamp
      });
      
      return reply.send({ notified: true });
    } catch (error) {
      app.log.error('Failed to log success notification:', error);
      return reply.status(500).send({ error: 'Failed to log notification' });
    }
  });

  app.post('/notify/quality-fail', async (request, reply) => {
    try {
      const { assetId, fileName, score, threshold, timestamp } = request.body as any;
      
      app.log.warn('Asset failed quality threshold:', {
        assetId,
        fileName,
        score,
        threshold,
        timestamp
      });
      
      return reply.send({ notified: true });
    } catch (error) {
      app.log.error('Failed to log quality failure notification:', error);
      return reply.status(500).send({ error: 'Failed to log notification' });
    }
  });
};