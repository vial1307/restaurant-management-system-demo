FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY scripts ./scripts

RUN node --check src/server.mjs \
 && node --check src/auth.mjs \
 && node --check src/db.mjs \
 && node --check src/password.mjs \
 && node --check src/admin-routes.mjs \
 && node --check src/inventory-extra-routes.mjs \
 && node --check scripts/set-password.mjs

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "src/server.mjs"]
