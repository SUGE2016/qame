FROM node:20-alpine

ENV HTTP_PROXY= HTTPS_PROXY= http_proxy= https_proxy= NO_PROXY=* no_proxy=*
RUN npm config set registry https://registry.npmmirror.com/

WORKDIR /app

COPY packages/shared-ui /app/packages/shared-ui
COPY packages/shared-utils /app/packages/shared-utils
COPY admin-console/package*.json ./

RUN npm install

WORKDIR /app/packages/shared-ui
RUN npm run build

WORKDIR /app

COPY admin-console/src ./src
COPY admin-console/public ./public

ARG REACT_APP_API_SERVER
ARG REACT_APP_GAME_SERVER
ARG REACT_APP_PASSWORD_SALT=your_fixed_salt_here
ENV REACT_APP_API_SERVER=$REACT_APP_API_SERVER
ENV REACT_APP_GAME_SERVER=$REACT_APP_GAME_SERVER
ENV REACT_APP_PASSWORD_SALT=$REACT_APP_PASSWORD_SALT

RUN DISABLE_ESLINT_PLUGIN=true CI=false npm run build \
    && npm install -g serve

EXPOSE 3001
CMD ["serve", "-s", "build", "-l", "3001"]
