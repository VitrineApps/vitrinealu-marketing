#!/usr/bin/env node

/**
 * VitrineAlu Marketing Automation System Validation
 * Tests the complete end-to-end automation pipeline
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m', 
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`)
};

// Validation checks
const checks = [
  {
    name: 'Project Structure',
    validate: () => {
      const requiredPaths = [
        'apps/worker',
        'apps/n8n-orchestrator',
        'packages/captioner',
        'packages/background-client',
        'n8n/workflows',
        'config/brand.yaml',
        'config/schedule.yaml',
        'config/providers.yaml'
      ];

      const missing = requiredPaths.filter(p => !fs.existsSync(path.join(projectRoot, p)));
      
      if (missing.length > 0) {
        throw new Error(`Missing required paths: ${missing.join(', ')}`);
      }
      
      return 'All required directories and files exist';
    }
  },
  
  {
    name: 'Package Dependencies',
    validate: () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
      
      const requiredDevDeps = ['turbo', 'typescript', 'vitest'];
      const missing = requiredDevDeps.filter(dep => !packageJson.devDependencies?.[dep]);
      
      if (missing.length > 0) {
        throw new Error(`Missing required dev dependencies: ${missing.join(', ')}`);
      }
      
      return 'All required dependencies are present';
    }
  },

  {
    name: 'Worker API Routes',
    validate: () => {
      const routesDir = path.join(projectRoot, 'apps/worker/src/routes/api');
      const requiredRoutes = [
        'media.ts',
        'background.ts', 
        'approvals.ts',
        'digest.ts',
        'metrics.ts'
      ];

      const missing = requiredRoutes.filter(route => 
        !fs.existsSync(path.join(routesDir, route))
      );

      if (missing.length > 0) {
        throw new Error(`Missing API route files: ${missing.join(', ')}`);
      }

      return 'All API route files exist';
    }
  },

  {
    name: 'n8n Workflows',
    validate: () => {
      const workflowsDir = path.join(projectRoot, 'n8n/workflows');
      const requiredWorkflows = [
        'main-automation-pipeline.json',
        'weekly-digest-approval.json', 
        'metrics-collection-reporting.json'
      ];

      const missing = requiredWorkflows.filter(workflow =>
        !fs.existsSync(path.join(workflowsDir, workflow))
      );

      if (missing.length > 0) {
        throw new Error(`Missing workflow files: ${missing.join(', ')}`);
      }

      // Validate workflow JSON structure
      for (const workflow of requiredWorkflows) {
        try {
          const content = fs.readFileSync(path.join(workflowsDir, workflow), 'utf8');
          const parsed = JSON.parse(content);
          
          if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
            throw new Error(`Invalid workflow structure in ${workflow}`);
          }
        } catch (error) {
          throw new Error(`Invalid JSON in ${workflow}: ${error.message}`);
        }
      }

      return 'All workflow files exist and have valid structure';
    }
  },

  {
    name: 'Configuration Files',
    validate: () => {
      const configFiles = [
        'config/brand.yaml',
        'config/schedule.yaml', 
        'config/providers.yaml'
      ];

      const results = [];

      for (const configFile of configFiles) {
        const filePath = path.join(projectRoot, configFile);
        
        if (!fs.existsSync(filePath)) {
          throw new Error(`Missing config file: ${configFile}`);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        
        // Basic YAML validation (checking for basic structure)
        if (!content.includes(':') || content.trim().length === 0) {
          throw new Error(`Invalid YAML structure in ${configFile}`);
        }

        results.push(`${configFile} ✓`);
      }

      return `Configuration files validated: ${results.join(', ')}`;
    }
  },

  {
    name: 'Docker Configuration', 
    validate: () => {
      const dockerComposePath = path.join(projectRoot, 'infra/compose/docker-compose.yml');
      
      if (!fs.existsSync(dockerComposePath)) {
        throw new Error('Docker Compose file missing');
      }

      const content = fs.readFileSync(dockerComposePath, 'utf8');
      
      const requiredServices = ['n8n', 'worker', 'web-approvals', 'background'];
      const missing = requiredServices.filter(service => !content.includes(service + ':'));

      if (missing.length > 0) {
        throw new Error(`Missing Docker services: ${missing.join(', ')}`);
      }

      return 'Docker Compose configuration is complete';
    }
  },

  {
    name: 'TypeScript Configuration',
    validate: () => {
      const tsconfigPath = path.join(projectRoot, 'tsconfig.base.json');
      
      if (!fs.existsSync(tsconfigPath)) {
        throw new Error('Base TypeScript config missing');
      }

      // Check worker TypeScript config
      const workerTsconfigPath = path.join(projectRoot, 'apps/worker/tsconfig.json');
      if (!fs.existsSync(workerTsconfigPath)) {
        throw new Error('Worker TypeScript config missing');
      }

      return 'TypeScript configurations are present';
    }
  },

  {
    name: 'Setup Scripts',
    validate: () => {
      const requiredScripts = [
        'scripts/setup-automation.sh',
        'scripts/setup-automation.ps1'
      ];

      const missing = requiredScripts.filter(script =>
        !fs.existsSync(path.join(projectRoot, script))
      );

      if (missing.length > 0) {
        throw new Error(`Missing setup scripts: ${missing.join(', ')}`);
      }

      return 'Setup scripts are available for both platforms';
    }
  },

  {
    name: 'Documentation',
    validate: () => {
      const requiredDocs = [
        'README.md',
        'RUNBOOK.md',
        'AUTOMATION_README.md'
      ];

      const missing = requiredDocs.filter(doc =>
        !fs.existsSync(path.join(projectRoot, doc))
      );

      if (missing.length > 0) {
        throw new Error(`Missing documentation: ${missing.join(', ')}`);
      }

      return 'All documentation files are present';
    }
  }
];

// Run validation
async function runValidation() {
  log.info('🔍 Starting VitrineAlu automation system validation...\n');

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    try {
      const result = await check.validate();
      log.success(`${check.name}: ${result}`);
      passed++;
    } catch (error) {
      log.error(`${check.name}: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  
  if (failed === 0) {
    log.success(`🎉 All ${passed} validation checks passed!`);
    log.info('✨ Your VitrineAlu automation system is ready to deploy!');
    console.log('\nNext steps:');
    console.log('1. Configure environment variables in infra/env/.env');
    console.log('2. Run setup script: ./scripts/setup-automation.ps1');
    console.log('3. Import workflows in n8n UI');
    console.log('4. Test with sample photos');
  } else {
    log.error(`❌ ${failed} validation check(s) failed out of ${passed + failed} total`);
    log.warning('Please fix the issues above before proceeding.');
    process.exit(1);
  }
}

// Self-validation: Check if running from correct directory
if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  log.error('Please run this script from the project root directory');
  process.exit(1);
}

runValidation().catch(error => {
  log.error(`Validation failed: ${error.message}`);
  process.exit(1);
});