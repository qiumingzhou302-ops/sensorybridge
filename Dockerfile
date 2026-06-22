FROM node:20-slim

WORKDIR /app

# 安装依赖（包括 devDependencies，因为需要 tsx 运行 TypeScript API）
COPY package*.json ./
RUN npm install

# 复制源码
COPY . .

# 构建前端
RUN npm run build

# 暴露端口（CloudBase 云托管会通过 PORT 环境变量指定）
EXPOSE 3000

# 启动生产服务器
CMD ["npx", "tsx", "server.mjs"]
