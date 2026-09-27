# Artifact-based image — dist/ must be pre-built before running docker build.
# Used by deploy/build.sh: pnpm build → docker build
FROM nginx:1.27-alpine
COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
