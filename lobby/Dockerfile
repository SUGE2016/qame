# 本机已有 node:20-alpine，避免拉 dockerpull.pw / Hub
FROM node:20-alpine AS builder

# 宿主 Docker HTTP_PROXY 会劫持 npmmirror，构建时直连
ENV HTTP_PROXY= HTTPS_PROXY= http_proxy= https_proxy= NO_PROXY=* no_proxy=*
RUN npm config set registry https://registry.npmmirror.com/

WORKDIR /app

COPY packages/shared-ui /app/packages/shared-ui
COPY packages/shared-utils /app/packages/shared-utils
COPY lobby/package*.json ./

RUN npm install

WORKDIR /app/packages/shared-ui
RUN npm run build

WORKDIR /app

COPY lobby/src ./src
COPY lobby/public ./public

ARG REACT_APP_SERVER
ARG REACT_APP_API_SERVER
ARG REACT_APP_GAME_SERVER
ARG REACT_APP_PASSWORD_SALT=your_fixed_salt_here
ENV REACT_APP_SERVER=$REACT_APP_SERVER
ENV REACT_APP_API_SERVER=$REACT_APP_API_SERVER
ENV REACT_APP_GAME_SERVER=$REACT_APP_GAME_SERVER
ENV REACT_APP_PASSWORD_SALT=$REACT_APP_PASSWORD_SALT
RUN DISABLE_ESLINT_PLUGIN=true CI=false npm run build

FROM node:20-alpine

ENV HTTP_PROXY= HTTPS_PROXY= http_proxy= https_proxy= NO_PROXY=* no_proxy=*
WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com/ \
    && npm install -g serve

COPY --from=builder /app/build ./build

EXPOSE 3000
CMD ["serve", "-s", "build", "-l", "3000"]
