FROM python:3.11-slim

# Install system dependencies for torch and opencv
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY services/background/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY services/background/ .

# Default command
CMD ["python", "-m", "services.background.cli", "--help"]