# Build from monorepo root:
#   docker build -f apps/backend/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
RUN npm ci --workspace=@finpa/backend

COPY apps/backend ./apps/backend
RUN npm run build --workspace=@finpa/backend

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
RUN npm ci --workspace=@finpa/backend --omit=dev

COPY --from=build /app/apps/backend/dist ./apps/backend/dist

WORKDIR /app/apps/backend
EXPOSE 3001
CMD ["node", "dist/index.js"]
