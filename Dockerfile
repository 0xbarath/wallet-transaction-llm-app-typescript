FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-engines --production=false

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma/
RUN npx prisma generate

COPY src ./src/
RUN yarn build

FROM node:20-alpine AS production

WORKDIR /app

COPY --from=builder /app/package.json /app/yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-engines --production=true

COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma/
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma/

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
