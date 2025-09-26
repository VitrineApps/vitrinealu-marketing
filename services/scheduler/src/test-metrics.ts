#!/usr/bin/env node
/**
 * Test script for metrics harvester functionality
 * Run with: node --loader ts-node/esm src/test-metrics.ts
 */

import { MetricsHarvester } from './metrics/harvester.js';
import { logger } from './logger.js';

async function testMetrics() {
  const harvester = new MetricsHarvester();
  
  try {
    logger.info('🚀 Testing metrics harvester...');
    
    // Test weekly metrics harvest
    logger.info('📊 Running weekly metrics harvest...');
    const report = await harvester.harvestWeeklyMetrics();
    
    logger.info('✅ Weekly metrics harvest completed!', {
      totalPosts: report.totalPosts,
      avgEngagement: report.avgEngagementRate,
      platformCount: report.platformBreakdown.length,
      insightsCount: report.insights.length
    });
    
    if (report.totalPosts > 0) {
      logger.info('📈 Top performing post:', {
        postId: report.topPosts[0]?.postId,
        platform: report.topPosts[0]?.platform,
        score: report.topPosts[0]?.performanceScore
      });
      
      logger.info('🎯 Platform breakdown:', report.platformBreakdown);
      logger.info('💡 Key insights:', report.insights.slice(0, 2));
    } else {
      logger.info('ℹ️  No posts found for the last week');
    }
    
    // Test historical metrics
    logger.info('📚 Testing historical metrics...');
    const historical = harvester.getHistoricalMetrics(7);
    logger.info(`📊 Found ${historical.length} historical metrics records`);
    
    harvester.close();
    logger.info('✅ All tests completed successfully!');
    
  } catch (error) {
    logger.error('❌ Test failed:', error);
    harvester.close();
    process.exit(1);
  }
}

// Run the test
if (process.argv[1].endsWith('test-metrics.ts') || process.argv[1].endsWith('test-metrics.js')) {
  testMetrics().catch(console.error);
}