FROM node:24-alpine AS builder
WORKDIR /app

ARG SERVICE
ENV SERVICE=${SERVICE}

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=loadservice-pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN node dev-scripts/build.js ${SERVICE}

FROM node:24-alpine AS production
WORKDIR /app

ARG SERVICE

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=loadservice-pnpm-prod,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist/apps/${SERVICE}/main.js ./main.js
COPY --from=builder /app/apps/gateway/config*.json ./

CMD ["node", "main.js"]
