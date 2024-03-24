FROM node:20-alpine

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install --force

WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --production

WORKDIR /app/client
COPY client/public ./public
COPY client/src ./src
RUN npm run build
RUN cp -r build ../server/client-app

WORKDIR /app/server
COPY server/src ./src

CMD ["node", "src/index.js"]