FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
COPY package.json ./
COPY src ./src
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/voorstel/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "src/server.js"]
