# syntax=docker/dockerfile:1

FROM oven/bun:1-slim AS deps

WORKDIR /app

ENV JAVA_HOME=/usr/lib/jvm/default-java
ENV PATH="${JAVA_HOME}/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      default-jdk \
      g++ \
      make \
      nodejs \
      python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY scripts ./scripts
RUN bun install --frozen-lockfile
RUN bun run setup

FROM oven/bun:1-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV JAVA_HOME=/usr/lib/jvm/default-java
ENV PATH="${JAVA_HOME}/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      default-jre-headless \
      nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/vendor ./vendor
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

ENTRYPOINT ["bun", "run", "src/index.ts"]
CMD ["help"]
