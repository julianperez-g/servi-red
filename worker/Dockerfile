
FROM node:22-alpine

WORKDIR /app

COPY worker/package.json worker/package-lock.json ./

RUN npm ci --omit=dev

COPY worker/index.mjs worker/procesador.mjs ./worker/
COPY shared/reportes/cobertura.mjs ./shared/reportes/cobertura.mjs

ENV NODE_ENV=production

CMD ["node", "worker/index.mjs"]
