FROM node:16.13.1-alpine
WORKDIR /app

COPY package.json ./
COPY package-lock.json ./

RUN npm install

COPY . .

EXPOSE 3001

ENTRYPOINT ["npm", "run", "start"]