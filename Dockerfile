FROM node:20-slim

WORKDIR /app

COPY . app/

RUN npm run build

CMD ["npm", "start"]