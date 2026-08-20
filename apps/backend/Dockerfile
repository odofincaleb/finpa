# Belmo / Render: build with context = apps/backend
#   docker build -t finpa-api .
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/index.js"]
