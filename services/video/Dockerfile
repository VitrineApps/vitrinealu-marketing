FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json tsconfig.build.json jest.config.ts ./
COPY src ./src
COPY tests ./tests

RUN npm run build

EXPOSE 8080

CMD ["node", "dist/index.js"]
