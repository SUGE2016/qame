FROM dockerpull.pw/node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm config set registry https://registry.npmmirror.com/ \
  && npm ci --omit=dev

COPY src/ ./src/

EXPOSE 8091

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:8091/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/http.js"]
