# Artifact-based image — dist/ must be pre-built before running docker build.
# Used by deploy/build.sh: pnpm build → docker build
FROM nginx:1.27-alpine
COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/05-api-upstream.sh /docker-entrypoint.d/05-api-upstream.sh
COPY docker-entrypoint.d/10-enable-ssl.sh /docker-entrypoint.d/10-enable-ssl.sh
RUN chmod +x /docker-entrypoint.d/05-api-upstream.sh /docker-entrypoint.d/10-enable-ssl.sh
EXPOSE 80 443
