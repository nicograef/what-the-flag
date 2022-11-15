FROM node:16-slim

WORKDIR /app

# Install Server Dependencies
COPY package*.json /app/
RUN npm ci

# Install Client Dependencies
COPY client/package*.json /app/client/
RUN cd client && npm ci

# Build Client App
COPY client/ /app/client/
RUN npm run build && cd ..

# Copy Server Source Code
COPY . /app/

# Start server
EXPOSE 3000
CMD ["npm", "start"]