#!/bin/bash

# ============================================================
# 扩展数据库注册脚本
# 用于将本地扩展注册到数据库中（用于非市场安装的扩展）
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
EXTENSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(cd "$EXTENSION_DIR/../.." && pwd)"

cd "$EXTENSION_DIR"

# 读取扩展信息
EXTENSION_NAME=$(node -p "require('./package.json').name")
EXTENSION_VERSION=$(node -p "require('./package.json').version")
EXTENSION_DESC=$(node -p "require('./package.json').description || ''")
EXTENSION_AUTHOR=$(node -p "require('./package.json').author || ''")

# 从 manifest.json 读取更多信息
if [ -f "manifest.json" ]; then
    MANIFEST_NAME=$(node -p "require('./manifest.json').name || ''")
    MANIFEST_TYPE=$(node -p "require('./manifest.json').type || 'application'")
    MANIFEST_ICON=$(node -p "require('./manifest.json').icon || ''")
else
    MANIFEST_NAME="$EXTENSION_NAME"
    MANIFEST_TYPE="application"
    MANIFEST_ICON=""
fi

# 如果 manifest 有更好的名称，使用它
if [ -n "$MANIFEST_NAME" ] && [ "$MANIFEST_NAME" != "undefined" ]; then
    DISPLAY_NAME="$MANIFEST_NAME"
else
    DISPLAY_NAME="$EXTENSION_NAME"
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🗄️  扩展数据库注册工具${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📦 扩展标识: ${EXTENSION_NAME}${NC}"
echo -e "${GREEN}📌 显示名称: ${DISPLAY_NAME}${NC}"
echo -e "${GREEN}📌 版本号: ${EXTENSION_VERSION}${NC}"
echo -e "${GREEN}📌 类型: ${MANIFEST_TYPE}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# 检查 extensions.json 是否存在
EXTENSIONS_JSON="$PROJECT_ROOT/extensions.json"
if [ ! -f "$EXTENSIONS_JSON" ]; then
    echo -e "${YELLOW}⚠️  extensions.json 不存在，创建新文件${NC}"
    echo '{"applications":{}}' > "$EXTENSIONS_JSON"
fi

# 更新 extensions.json
echo -e "\n${YELLOW}[1/2] 📝 更新 extensions.json...${NC}"

# 使用 node 脚本更新 JSON
node -e "
const fs = require('fs');
const path = require('path');

const extensionsJsonPath = '$EXTENSIONS_JSON';
const extensionsJson = JSON.parse(fs.readFileSync(extensionsJsonPath, 'utf8'));

// 确保 applications 键存在
if (!extensionsJson.applications) {
    extensionsJson.applications = {};
}

// 添加或更新扩展配置
extensionsJson.applications['$EXTENSION_NAME'] = {
    manifest: {
        identifier: '$EXTENSION_NAME',
        name: '$DISPLAY_NAME',
        version: '$EXTENSION_VERSION',
        description: '$EXTENSION_DESC',
        author: {
            name: '$EXTENSION_AUTHOR',
            avatar: '',
            homepage: ''
        }
    },
    isLocal: true,
    enabled: true,
    installedAt: new Date().toISOString()
};

fs.writeFileSync(extensionsJsonPath, JSON.stringify(extensionsJson, null, 4));
console.log('✓ extensions.json 更新成功');
"

echo -e "${GREEN}✓ extensions.json 更新完成${NC}"

# 生成 SQL 语句
echo -e "\n${YELLOW}[2/2] 📋 生成数据库注册 SQL...${NC}"

SQL_FILE="$SCRIPT_DIR/register_extension.sql"
cat > "$SQL_FILE" << EOF
-- ============================================================
-- 扩展数据库注册 SQL
-- 扩展: ${EXTENSION_NAME} v${EXTENSION_VERSION}
-- 生成时间: $(date '+%Y-%m-%d %H:%M:%S')
-- ============================================================

-- 检查扩展是否已存在
DO \$\$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM extensions WHERE identifier = '${EXTENSION_NAME}'
    ) THEN
        -- 插入新扩展记录
        INSERT INTO extensions (
            id,
            name,
            identifier,
            version,
            description,
            icon,
            type,
            support_terminal,
            status,
            is_local,
            author,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            '${DISPLAY_NAME}',
            '${EXTENSION_NAME}',
            '${EXTENSION_VERSION}',
            '${EXTENSION_DESC}',
            '${MANIFEST_ICON}',
            '${MANIFEST_TYPE}',
            ARRAY['web', 'mobile']::text[],
            'enabled',
            true,
            '{"name": "${EXTENSION_AUTHOR}", "avatar": "", "homepage": ""}'::jsonb,
            NOW(),
            NOW()
        );
        RAISE NOTICE '✓ 扩展注册成功: ${EXTENSION_NAME}';
    ELSE
        -- 更新现有扩展版本
        UPDATE extensions
        SET 
            version = '${EXTENSION_VERSION}',
            name = '${DISPLAY_NAME}',
            description = '${EXTENSION_DESC}',
            updated_at = NOW()
        WHERE identifier = '${EXTENSION_NAME}';
        RAISE NOTICE '✓ 扩展版本更新成功: ${EXTENSION_NAME} -> ${EXTENSION_VERSION}';
    END IF;
END \$\$;

-- 验证注册结果
SELECT id, name, identifier, version, status, is_local 
FROM extensions 
WHERE identifier = '${EXTENSION_NAME}';
EOF

echo -e "${GREEN}✓ SQL 文件生成完成: ${SQL_FILE}${NC}"

# 输出结果
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ 注册准备完成!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "\n${BLUE}📋 后续步骤:${NC}"
echo -e "   ${YELLOW}方式 1: 自动执行（需要配置数据库连接）${NC}"
echo -e "   psql -h <host> -U <user> -d <database> -f ${SQL_FILE}"
echo -e ""
echo -e "   ${YELLOW}方式 2: 手动执行${NC}"
echo -e "   1. 登录数据库管理工具（如 pgAdmin, DBeaver）"
echo -e "   2. 执行 ${SQL_FILE} 中的 SQL 语句"
echo -e ""
echo -e "   ${YELLOW}方式 3: 重启服务后自动加载${NC}"
echo -e "   如果已更新 extensions.json，重启服务即可自动加载"
echo -e "   pm2 restart all"
echo -e ""
