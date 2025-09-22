# Makefile for Media Ingest Service

.PHONY: media-install media-test media-run-once media-lint media-clean media-setup

# Install dependencies
media-install:
	conda env create -f environment.yml --force || conda env update -f environment.yml

# Run tests
media-test:
	PYTHONPATH=src pytest tests/ -v

# Run once on sample data
media-run-once:
	python -m media_ingest.cli run-once tests/fixtures/sample.jpg --source test

# Lint code
media-lint:
	flake8 src/ tests/
	black --check src/ tests/
	isort --check-only src/ tests/

# Format code
media-format:
	black src/ tests/
	isort src/ tests/

# Clean temporary files
media-clean:
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	rm -rf .pytest_cache/
	rm -rf logs/*.log
	rm -rf state/*.db

# Setup development environment
media-setup: media-install
	mkdir -p logs state
	cp env.example .env
	cp config/brand.example.yaml config/brand.yaml
	@echo "Setup complete. Edit .env and config/brand.yaml with your settings."
	@echo "Activate the environment with: conda activate media-ingest"

# Run with coverage
media-coverage:
	PYTHONPATH=src pytest tests/ --cov=src/media_ingest --cov-report=html

# Build distribution
media-build:
	python -m build

# Install in development mode
media-dev-install:
	conda run -n media-ingest pip install -e .