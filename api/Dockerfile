# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# bcrypt requires python3 + make + g++ to compile native bindings on Alpine
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy only production deps
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Run as non-root for security
RUN addgroup -S nestgroup && adduser -S nestuser -G nestgroup
USER nestuser

EXPOSE 3000

# dumb-init handles PID 1 signal forwarding correctly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main"]
