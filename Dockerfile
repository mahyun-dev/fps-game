FROM node:20-alpine

WORKDIR /app

COPY server/package*.json /app/server/
RUN cd /app/server && npm ci --omit=dev

COPY server /app/server

WORKDIR /app/server
ENV NODE_ENV=production

CMD ["npm", "start"]
