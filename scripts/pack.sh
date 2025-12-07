#!/bin/bash

# ============================================================
# 扩展发布打包脚本
# 用于将本地开发的扩展打包为可部署的 ZIP 包
# ============================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取脚本所在目录（扩展根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 读取 package.json 获取扩展信息
EXTENSION_NAME=$(node -p "require('./package.json').name")
EXTENSION_VERSION=$(node -p "require('./package.json').version")

# 输出目录
OUTPUT_DIR="$SCRIPT_DIR/dist"
ZIP_FILE="$OUTPUT_DIR/${EXTENSION_NAME}-v${EXTENSION_VERSION}.zip"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🚀 扩展发布打包工具${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📦 扩展名称: ${EXTENSION_NAME}${NC}"
echo -e "${GREEN}📌 版本号: ${EXTENSION_VERSION}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# 步骤 1: 清理并构建
echo -e "\n${YELLOW}[1/5] 🧹 清理旧的构建产物...${NC}"
pnpm clean

echo -e "\n${YELLOW}[2/5] 🔨 构建前端...${NC}"
pnpm build:web

echo -e "\n${YELLOW}[3/5] 🔨 构建后端...${NC}"
pnpm build:api

# 步骤 2: 验证构建产物
echo -e "\n${YELLOW}[4/5] ✅ 验证构建产物...${NC}"

if [ ! -d "build" ]; then
    echo -e "${RED}❌ 错误: build/ 目录不存在${NC}"
    exit 1
fi

if [ ! -d ".output/public" ]; then
    echo -e "${RED}❌ 错误: .output/public/ 目录不存在${NC}"
    exit 1
fi

if [ ! -f "manifest.json" ]; then
    echo -e "${RED}❌ 错误: manifest.json 不存在${NC}"
    exit 1
fi

echo -e "${GREEN}✓ build/ 目录存在${NC}"
echo -e "${GREEN}✓ .output/public/ 目录存在${NC}"
echo -e "${GREEN}✓ manifest.json 存在${NC}"

# 步骤 3: 创建 ZIP 包
echo -e "\n${YELLOW}[5/5] 📦 创建发布包...${NC}"

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

# 删除旧的 ZIP 文件
if [ -f "$ZIP_FILE" ]; then
    rm "$ZIP_FILE"
fi

# 创建 ZIP 包（排除不必要的文件）
zip -r "$ZIP_FILE" \
    build/ \
    .output/public/ \
    manifest.json \
    package.json \
    -x "*.DS_Store" \
    -x "*__MACOSX*"

# 输出结果
ZIP_SIZE=$(du -h "$ZIP_FILE" | cut -f1)

echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ 打包成功!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📦 文件名: ${EXTENSION_NAME}-v${EXTENSION_VERSION}.zip${NC}"
echo -e "${GREEN}📂 位置: ${ZIP_FILE}${NC}"
echo -e "${GREEN}📊 大小: ${ZIP_SIZE}${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "\n${BLUE}📋 下一步操作:${NC}"
echo -e "   1. 将 ZIP 包上传到线上服务器"
echo -e "   2. 运行部署脚本: ./scripts/deploy.sh ${ZIP_FILE}"
echo -e ""
