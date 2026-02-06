FROM node:20-slim AS dependencies

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && npm install -g pnpm \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod

COPY src ./src

RUN mkdir -p /data

VOLUME /data

ENV DATA_DIR=/data
ENV NODE_ENV=production

EXPOSE 3000

CMD ["pnpm", "start"]
