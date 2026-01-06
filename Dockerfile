# Multi-stage: Build React app with Node, serve with Nginx
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
# Build for production (sets REACT_APP_* env vars from docker-compose)
RUN npm run build

# Serve static files with Nginx
FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
# SPA routing fix (handles client-side routes)
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]