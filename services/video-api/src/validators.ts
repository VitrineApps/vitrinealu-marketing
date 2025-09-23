import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { VideoRequestSchema } from './types';
import logger from './logger';

/**
 * Generic Zod validation middleware
 */
export function validateSchema<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn({ error: error.errors, path: req.path }, 'Validation error');
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid request data',
          details: error.errors,
          timestamp: new Date().toISOString(),
          path: req.path,
          statusCode: 400,
        });
      }
      
      logger.error({ error }, 'Unexpected validation error');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred during validation',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 500,
      });
    }
  };
}

/**
 * Validate video request body
 */
export const validateVideoRequest = validateSchema(VideoRequestSchema);

/**
 * Validate job ID parameter
 */
export function validateJobId(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params;
  
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid job ID',
      timestamp: new Date().toISOString(),
      path: req.path,
      statusCode: 400,
    });
  }
  
  next();
}

/**
 * Validate file uploads - placeholder for multer integration
 */
export function validateFileUpload(req: Request, res: Response, next: NextFunction) {
  // This would be implemented with proper multer types in production
  next();
}