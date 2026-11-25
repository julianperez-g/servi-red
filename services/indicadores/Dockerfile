FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node src ./src

ENV NODE_ENV=production
ENV PORT=4001

USER node
EXPOSE 4001

CMD ["npm", "start"]
