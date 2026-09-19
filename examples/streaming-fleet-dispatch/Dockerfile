FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files to link trihex core
COPY package*.json tsconfig.json ./
COPY src/ ./src/
RUN npm ci && npm run build

# Setup streaming reference app
WORKDIR /app/examples/streaming-fleet-dispatch
COPY examples/streaming-fleet-dispatch/package*.json examples/streaming-fleet-dispatch/tsconfig.json ./
RUN npm install

COPY examples/streaming-fleet-dispatch/src/ ./src/
RUN npm run build

EXPOSE 8080
CMD ["npm", "run", "start:api"]
