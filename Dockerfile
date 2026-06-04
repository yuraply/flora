# Stage 1: Build the application
FROM node:20-slim AS build

WORKDIR /app

# Install Python and build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Serve with Node.js
FROM node:20-alpine

WORKDIR /app

# Install Python and build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy built assets
COPY --from=build /app/dist ./dist

# Copy server, monitoring, dashboard, runtime helpers and package files
COPY server.js monitoring.js admin-dashboard.html package*.json ./
COPY utils ./utils

# Install production dependencies only (will rebuild native modules)
RUN npm install --omit=dev

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 80

CMD ["node", "server.js"]
