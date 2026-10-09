# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:24.10.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false --mount=type=cache,target=/root/.npm npm ci
COPY index.html ./
COPY src ./src
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.28.0-alpine AS runtime
WORKDIR /usr/share/nginx/html
COPY --link --from=build /app/dist ./
COPY --link nginx.conf /etc/nginx/conf.d/default.conf
ENV TZ=Europe/Moscow
LABEL org.opencontainers.image.source="https://github.com/JustIkra/umir-frontend"
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]

