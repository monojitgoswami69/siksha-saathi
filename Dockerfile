FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat curl

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ENV NODE_ENV=development \
    PORT=3000 \
    HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0", "-p", "3000"]
