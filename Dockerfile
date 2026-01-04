FROM node:18-alpine

WORKDIR /app

# Install dependencies first to leverage caching
COPY package*.json ./
RUN npm install --production

# Copy application source
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
