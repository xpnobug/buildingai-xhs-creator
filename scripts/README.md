# 扩展部署脚本使用指南

本目录包含三个自动化脚本，用于将本地开发的扩展部署到线上环境（不通过市场）。

---

## 📁 脚本列表

| 脚本 | 用途 | 运行位置 |
|------|------|----------|
| `pack.sh` | 构建并打包扩展为 ZIP 包 | 本地开发环境 |
| `deploy.sh` | 解压并安装扩展到服务器 | 线上服务器 |
| `register.sh` | 注册扩展到数据库 | 线上服务器 |

---

## 🚀 完整部署流程

### 步骤 1：本地打包

在本地开发环境执行：

```bash
cd extensions/buildingai-xhs-creator

# 添加执行权限（首次）
chmod +x scripts/pack.sh

# 执行打包
./scripts/pack.sh
```

**输出结果**：
```
📦 文件名: buildingai-xhs-creator-v1.1.0.zip
📂 位置: extensions/buildingai-xhs-creator/dist/buildingai-xhs-creator-v1.1.0.zip
```

### 步骤 2：上传到服务器

```bash
# 使用 scp 上传
scp dist/buildingai-xhs-creator-v1.1.0.zip user@server:/tmp/

# 或使用其他方式（FTP、SFTP 等）
```

### 步骤 3：服务器部署

在线上服务器执行：

```bash
cd /path/to/buildingai

# 添加执行权限（首次）
chmod +x extensions/buildingai-xhs-creator/scripts/deploy.sh

# 执行部署
./extensions/buildingai-xhs-creator/scripts/deploy.sh /tmp/buildingai-xhs-creator-v1.1.0.zip
```

**部署脚本会自动**：
1. 备份现有扩展的 `data/`、`storage/`、`node_modules/` 目录
2. 解压新版本
3. 恢复备份的数据目录
4. 复制前端资源到 `public/web/extensions/`
5. 安装依赖
6. 重启 PM2 进程

### 步骤 4：数据库注册（如需要）

如果扩展未在系统中显示：

```bash
# 生成注册配置和 SQL
./extensions/buildingai-xhs-creator/scripts/register.sh

# 执行 SQL（二选一）
# 方式 1：命令行
psql -h localhost -U postgres -d buildingai -f extensions/buildingai-xhs-creator/scripts/register_extension.sql

# 方式 2：重启服务自动加载
pm2 restart all
```

---

## 📋 脚本详解

### pack.sh - 打包脚本

```
执行流程:
┌──────────────────────────────────────────┐
│ 1. pnpm clean      - 清理旧构建         │
│ 2. pnpm build:web  - 构建前端           │
│ 3. pnpm build:api  - 构建后端           │
│ 4. 验证构建产物                          │
│ 5. 创建 ZIP 包                           │
└──────────────────────────────────────────┘

输出文件:
  dist/{name}-v{version}.zip

包含内容:
  ├── build/              # 后端编译产物
  ├── .output/public/     # 前端编译产物
  ├── manifest.json       # 扩展清单
  └── package.json        # 包配置
```

### deploy.sh - 部署脚本

```
执行流程:
┌──────────────────────────────────────────┐
│ 1. 验证 ZIP 文件                         │
│ 2. 备份现有数据目录                       │
│ 3. 解压到临时目录                        │
│ 4. 验证文件结构                          │
│ 5. 删除旧扩展目录                        │
│ 6. 复制新扩展文件                        │
│ 7. 恢复备份数据                          │
│ 8. 复制前端资源                          │
│ 9. 安装依赖                              │
│ 10. 重启 PM2                             │
└──────────────────────────────────────────┘

保留的目录（升级时不会丢失）:
  - data/         数据目录
  - storage/      存储目录
  - node_modules/ 依赖目录
```

### register.sh - 注册脚本

```
执行流程:
┌──────────────────────────────────────────┐
│ 1. 读取 package.json 和 manifest.json   │
│ 2. 更新 extensions.json 配置            │
│ 3. 生成 SQL 注册语句                     │
└──────────────────────────────────────────┘

输出文件:
  scripts/register_extension.sql
```

---

## ⚠️ 注意事项

1. **权限问题**
   ```bash
   # 确保脚本有执行权限
   chmod +x scripts/*.sh
   
   # 确保目录有写入权限
   chmod -R 755 extensions/
   chmod -R 755 public/web/extensions/
   ```

2. **PM2 环境**
   - 脚本会自动检测 PM2 并重启
   - 如果未使用 PM2，需手动重启服务

3. **数据库连接**
   - `register.sh` 生成 SQL 文件，需手动执行
   - 也可配置 `.env` 中的数据库连接自动执行

4. **备份策略**
   - 部署脚本会自动备份到 `storage/temp/backup_*`
   - 确认无误后可手动删除备份

---

## 🔧 快速命令参考

```bash
# 完整部署流程（一键脚本）

# 本地
cd extensions/buildingai-xhs-creator
./scripts/pack.sh

# 上传
scp dist/*.zip user@server:/tmp/

# 服务器
ssh user@server
cd /path/to/buildingai
./extensions/buildingai-xhs-creator/scripts/deploy.sh /tmp/buildingai-xhs-creator-*.zip
./extensions/buildingai-xhs-creator/scripts/register.sh
pm2 restart all
```

---

> **最后更新**: 2025-12-07
