# ==========================================
# Production Frontend Dockerfile (Multi-stage)
# ==========================================

# 1. Build Stage
FROM node:20-slim AS builder

WORKDIR /app

# Ensure deterministic dependency installation
COPY package.json package-lock.json* bun.lock* ./
RUN npm install

# Copy source code and build assets
COPY . .
ENV NODE_ENV=production
RUN npm run build

# 2. Production Runtime Stage (Nginx Alpine)
FROM nginx:alpine

# Remove default nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy custom production nginx configuration with security headers & SPA routing
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose standard HTTP port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1

# Start nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
