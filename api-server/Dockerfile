FROM dockerpull.pw/node:18-alpine

RUN npm config set registry https://registry.npmmirror.com/

WORKDIR /workspace

COPY packages/qame-games ./packages/qame-games
COPY api-server ./api-server

WORKDIR /workspace/api-server
RUN npm install

EXPOSE 8001

CMD ["npm", "start"]
