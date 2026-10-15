# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:24.21.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false --mount=type=cache,target=/root/.npm npm ci
COPY index.html ./
COPY public ./public
COPY tsconfig.json vite.config.mjs ./
COPY src ./src
RUN npm run typecheck && npm run build

FROM nginxinc/nginx-unprivileged:1.30.5-alpine AS runtime
WORKDIR /usr/share/nginx/html
COPY --link --from=build /app/dist ./
# The entrypoint fills in nginx.conf as a template (UMIR_* only) and writes conf.d/default.conf.
COPY --link nginx.conf /etc/nginx/templates/default.conf.template
COPY --link security-headers.conf /etc/nginx/security-headers.conf
ENV TZ=Europe/Moscow
ENV NGINX_ENVSUBST_FILTER=^UMIR_
# CIDR of the proxy in front whose X-Forwarded-For is believed; the default trusts only the loopback.
ENV UMIR_TRUSTED_PROXY=127.0.0.1/32
LABEL org.opencontainers.image.source="https://github.com/JustIkra/umir-frontend"
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/readyz"]

