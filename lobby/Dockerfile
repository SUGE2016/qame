# 构建阶段
FROM dockerpull.pw/node:18-alpine AS builder

RUN npm config set registry https://registry.npmmirror.com/

WORKDIR /app

COPY packages/shared-ui /app/packages/shared-ui
COPY packages/shared-utils /app/packages/shared-utils
COPY lobby/package*.json ./

RUN npm install

WORKDIR /app/packages/shared-ui
RUN npm run build

WORKDIR /app

# 复制lobby源代码
COPY lobby/src ./src
COPY lobby/public ./public

# 构建应用 - 使用构建参数
ARG REACT_APP_SERVER
ARG REACT_APP_API_SERVER
ARG REACT_APP_GAME_SERVER
ARG REACT_APP_PASSWORD_SALT
ENV REACT_APP_SERVER=$REACT_APP_SERVER
ENV REACT_APP_API_SERVER=$REACT_APP_API_SERVER
ENV REACT_APP_GAME_SERVER=$REACT_APP_GAME_SERVER
ENV REACT_APP_PASSWORD_SALT=$REACT_APP_PASSWORD_SALT
RUN npm run build

# 生产阶段
FROM dockerpull.pw/node:18-alpine

WORKDIR /app

# 安装serve来提供静态文件服务
RUN npm config set registry https://registry.npmmirror.com/
RUN npm install -g serve

# 从构建阶段复制构建结果
COPY --from=builder /app/build ./build

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["serve", "-s", "build", "-l", "3000"] 