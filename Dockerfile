FROM node:16.13.1-alpine
WORKDIR /app

COPY package.json ./
COPY package-lock.json ./

RUN npm install
RUN npm install typescript -g

COPY . .

RUN tsc

ENTRYPOINT ["npm", "run", "start"]