FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache python3 make g++
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache python3 make g++
RUN npm ci --omit=dev
COPY server.js ./
COPY server/ ./server/
COPY docker/ ./docker/
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["node", "server.js"]
