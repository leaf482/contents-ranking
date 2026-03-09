FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG GO_API_URL=http://localhost:8080
ARG SIMULATION_URL=http://localhost:3000
ENV GO_API_URL=$GO_API_URL
ENV SIMULATION_URL=$SIMULATION_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
