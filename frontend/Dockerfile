FROM node:20-alpine AS builder

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies using a clean install for reproducible builds
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy the rest of the frontend code and build the production bundle
COPY . .
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginx:1.27-alpine AS runtime

# Copy the compiled frontend assets to NGINX
COPY --from=builder /app/dist /usr/share/nginx/html

# Provide a hardened default NGINX configuration
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Use the default command provided by nginx base image
