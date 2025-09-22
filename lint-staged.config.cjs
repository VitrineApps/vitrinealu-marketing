module.exports = {
  '*.{js,jsx,ts,tsx,cts,mts}': ['eslint --max-warnings=0'],
  '*.{js,jsx,ts,tsx,cts,mts,md,yml,yaml,css,scss}': ['prettier --write'],
  '*.json': ['prettier --write', '!apps/n8n-orchestrator/workflows/*.json']
};
