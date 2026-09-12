FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY sql.mjs server.mjs ./

USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
