# Vue UI Dashboard Dockerfile
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Parameterized upstream hosts (defaults work with docker/docker-compose.simple.yml)
ARG API_UPSTREAM=neural-ai-platform:3000
ARG MCP_UPSTREAM=neural-ai-platform:5174
ARG WS_UPSTREAM=neural-ai-platform:3001

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# Write nginx config template and substitute ARG values via envsubst
RUN printf 'worker_processes auto;\n\
error_log /var/log/nginx/error.log;\n\
pid /run/nginx.pid;\n\
\n\
events {\n\
    worker_connections 1024;\n\
}\n\
\n\
http {\n\
    log_format main '"'"'$remote_addr - $remote_user [$time_local] "$request" '"'"'\n\
                      '"'"'$status $body_bytes_sent "$http_referer" '"'"'\n\
                      '"'"'"$http_user_agent" "$http_x_forwarded_for"'"'"';\n\
\n\
    access_log /var/log/nginx/access.log main;\n\
\n\
    sendfile on;\n\
    tcp_nopush on;\n\
    tcp_nodelay on;\n\
    keepalive_timeout 65;\n\
    types_hash_max_size 2048;\n\
\n\
    include /etc/nginx/mime.types;\n\
    default_type application/octet-stream;\n\
\n\
    server {\n\
        listen 5176;\n\
        server_name localhost;\n\
        root /usr/share/nginx/html;\n\
        index index.html;\n\
\n\
        location / {\n\
            try_files $uri $uri/ /index.html;\n\
        }\n\
\n\
        location /api/graph-export {\n\
            proxy_pass http://MCSX_UPSTREAM/api/graph-export;\n\
            proxy_http_version 1.1;\n\
            proxy_set_header Host $host;\n\
            proxy_set_header X-Real-IP $remote_addr;\n\
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
            proxy_set_header X-Forwarded-Proto $scheme;\n\
            proxy_set_header x-api-key NGINX_API_KEY_PLACEHOLDER;\n\
        }\n\
\n\
        location /api/ {\n\
            proxy_pass http://APIX_UPSTREAM/api/;\n\
            proxy_http_version 1.1;\n\
            proxy_set_header Upgrade $http_upgrade;\n\
            proxy_set_header Connection '"'"'upgrade'"'"';\n\
            proxy_set_header Host $host;\n\
            proxy_set_header X-Real-IP $remote_addr;\n\
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
            proxy_set_header X-Forwarded-Proto $scheme;\n\
            proxy_set_header x-api-key NGINX_API_KEY_PLACEHOLDER;\n\
            proxy_cache_bypass $http_upgrade;\n\
        }\n\
\n\
        location /ws {\n\
            proxy_pass http://WSX_UPSTREAM;\n\
            proxy_http_version 1.1;\n\
            proxy_set_header Upgrade $http_upgrade;\n\
            proxy_set_header Connection "upgrade";\n\
            proxy_set_header Host $host;\n\
            proxy_set_header X-Real-IP $remote_addr;\n\
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
            proxy_set_header X-Forwarded-Proto $scheme;\n\
        }\n\
    }\n\
}\n' > /etc/nginx/nginx.conf.template \
    && sed -i "s|APIX_UPSTREAM|${API_UPSTREAM}|g" /etc/nginx/nginx.conf.template \
    && sed -i "s|MCSX_UPSTREAM|${MCP_UPSTREAM}|g" /etc/nginx/nginx.conf.template \
    && sed -i "s|WSX_UPSTREAM|${WS_UPSTREAM}|g" /etc/nginx/nginx.conf.template \
    && cp /etc/nginx/nginx.conf.template /etc/nginx/nginx.conf

# Expose port
EXPOSE 5176

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5176/ || exit 1

CMD ["/bin/sh", "-c", "sed -i \"s|NGINX_API_KEY_PLACEHOLDER|${NEURAL_API_KEY:-}|g\" /etc/nginx/nginx.conf && nginx -g 'daemon off;'"]
