#!/bin/bash

# ============================================================
# 扩展线上部署脚本
# 用于在线上服务器安装本地开发的扩展（不通过市场）
# 
# 使用方法:
#   ./deploy.sh <zip_file_path>
#   ./deploy.sh /path/to/buildingai-xhs-creator-v1.1.0.zip
# ============================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查参数
if [ -z "$1" ]; then
    echo -e "${RED}❌ 错误: 请提供 ZIP 包路径${NC}"
    echo -e "${YELLOW}用法: ./deploy.sh <zip_file_path>${NC}"
    echo -e "${YELLOW}示例: ./deploy.sh /tmp/buildingai-xhs-creator-v1.1.0.zip${NC}"
    exit 1
fi

ZIP_FILE="$1"

# 验证 ZIP 文件存在
if [ ! -f "$ZIP_FILE" ]; then
    echo -e "${RED}❌ 错误: ZIP 文件不存在: ${ZIP_FILE}${NC}"
    exit 1
fi

# 获取项目根目录（假设脚本在 extensions/{name}/scripts/ 下）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(cd "$EXTENSION_DIR/../.." && pwd)"

# 从 ZIP 文件名解析扩展信息
ZIP_BASENAME=$(basename "$ZIP_FILE" .zip)
EXTENSION_NAME=$(echo "$ZIP_BASENAME" | sed 's/-v[0-9].*$//')

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🚀 扩展部署工具${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📦 ZIP 文件: ${ZIP_FILE}${NC}"
echo -e "${GREEN}📌 扩展名称: ${EXTENSION_NAME}${NC}"
echo -e "${GREEN}📂 项目根目录: ${PROJECT_ROOT}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# 定义目标目录
EXTENSIONS_DIR="$PROJECT_ROOT/extensions"
TARGET_DIR="$EXTENSIONS_DIR/$EXTENSION_NAME"
WEB_ASSETS_DIR="$PROJECT_ROOT/public/web/extensions/$EXTENSION_NAME"
TEMP_DIR="$PROJECT_ROOT/storage/temp/deploy_${EXTENSION_NAME}_$$"

# 步骤 1: 备份现有扩展（如果存在）
echo -e "\n${YELLOW}[1/7] 📦 检查现有扩展...${NC}"
BACKUP_DIR=""
if [ -d "$TARGET_DIR" ]; then
    BACKUP_DIR="$PROJECT_ROOT/storage/temp/backup_${EXTENSION_NAME}_$(date +%Y%m%d_%H%M%S)"
    echo -e "${YELLOW}⚠️  发现现有扩展，备份到: ${BACKUP_DIR}${NC}"
    mkdir -p "$BACKUP_DIR"
    
    # 备份需要保留的目录
    for dir in "data" "storage" "node_modules"; do
        if [ -d "$TARGET_DIR/$dir" ]; then
            cp -r "$TARGET_DIR/$dir" "$BACKUP_DIR/"
            echo -e "${GREEN}✓ 备份 ${dir}/${NC}"
        fi
    done
fi

# 步骤 2: 解压 ZIP 包
echo -e "\n${YELLOW}[2/7] 📂 解压 ZIP 包...${NC}"
mkdir -p "$TEMP_DIR"
unzip -q "$ZIP_FILE" -d "$TEMP_DIR"
echo -e "${GREEN}✓ 解压完成${NC}"

# 步骤 3: 验证解压内容
echo -e "\n${YELLOW}[3/7] ✅ 验证文件结构...${NC}"
if [ ! -d "$TEMP_DIR/build" ]; then
    echo -e "${RED}❌ 错误: 缺少 build/ 目录${NC}"
    rm -rf "$TEMP_DIR"
    exit 1
fi

if [ ! -d "$TEMP_DIR/.output/public" ]; then
    echo -e "${RED}❌ 错误: 缺少 .output/public/ 目录${NC}"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo -e "${GREEN}✓ 文件结构验证通过${NC}"

# 步骤 4: 删除旧扩展目录
echo -e "\n${YELLOW}[4/7] 🗑️  清理旧扩展目录...${NC}"
if [ -d "$TARGET_DIR" ]; then
    rm -rf "$TARGET_DIR"
fi
if [ -d "$WEB_ASSETS_DIR" ]; then
    rm -rf "$WEB_ASSETS_DIR"
fi
echo -e "${GREEN}✓ 清理完成${NC}"

# 步骤 5: 安装新扩展
echo -e "\n${YELLOW}[5/7] 📥 安装新扩展...${NC}"
mkdir -p "$TARGET_DIR"
cp -r "$TEMP_DIR"/* "$TARGET_DIR/"

# 恢复备份的目录
if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
    for dir in "data" "storage" "node_modules"; do
        if [ -d "$BACKUP_DIR/$dir" ]; then
            cp -r "$BACKUP_DIR/$dir" "$TARGET_DIR/"
            echo -e "${GREEN}✓ 恢复 ${dir}/${NC}"
        fi
    done
fi

echo -e "${GREEN}✓ 扩展安装完成${NC}"

# 步骤 6: 复制前端资源
echo -e "\n${YELLOW}[6/7] 🎨 复制前端资源...${NC}"
mkdir -p "$WEB_ASSETS_DIR"
cp -r "$TARGET_DIR/.output/public"/* "$WEB_ASSETS_DIR/"
echo -e "${GREEN}✓ 前端资源复制完成${NC}"

# 步骤 7: 安装依赖并重启
echo -e "\n${YELLOW}[7/7] 🔄 安装依赖并重启服务...${NC}"
cd "$PROJECT_ROOT"

# 安装依赖
pnpm install --no-frozen-lockfile
echo -e "${GREEN}✓ 依赖安装完成${NC}"

# 检查是否在 PM2 环境中运行
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "buildingai"; then
        echo -e "${YELLOW}🔄 重启 PM2 进程...${NC}"
        pm2 restart all
        echo -e "${GREEN}✓ PM2 重启完成${NC}"
    else
        echo -e "${YELLOW}⚠️  PM2 进程未运行，跳过重启${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  PM2 未安装，请手动重启服务${NC}"
fi

# 清理临时文件
rm -rf "$TEMP_DIR"
if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
    echo -e "${YELLOW}💡 备份保留在: ${BACKUP_DIR}${NC}"
    echo -e "${YELLOW}   可在确认无误后手动删除${NC}"
fi

# 输出结果
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ 部署成功!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📦 扩展名称: ${EXTENSION_NAME}${NC}"
echo -e "${GREEN}📂 安装目录: ${TARGET_DIR}${NC}"
echo -e "${GREEN}🎨 前端资源: ${WEB_ASSETS_DIR}${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "\n${BLUE}📋 验证步骤:${NC}"
echo -e "   1. 访问应用管理页面检查扩展是否显示"
echo -e "   2. 如果扩展未显示，可能需要在数据库中注册"
echo -e "   3. 运行: ./scripts/register.sh 完成数据库注册"
echo -e ""
