# 扩展管理 API 文档

本文档详细分析了 BuildingAI 平台的扩展管理核心 API 接口。

---

## 目录

1. [扩展列表查询接口](#1-扩展列表查询接口)
2. [扩展安装接口](#2-扩展安装接口)
3. [相关服务说明](#3-相关服务说明)
4. [目录结构](#4-目录结构)

---

## 1. 扩展列表查询接口

### 1.1 接口概述

| 属性 | 说明 |
|------|------|
| **路径** | `GET /consoleapi/extensions` |
| **权限** | `list` (查看应用列表) |
| **功能** | 获取扩展分页列表（本地已安装 + 市场可安装） |

### 1.2 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `page` | number | 是 | 页码，从 1 开始 |
| `pageSize` | number | 是 | 每页数量 |
| `name` | string | 否 | 扩展名称（模糊搜索） |
| `identifier` | string | 否 | 扩展标识符（模糊搜索） |
| `type` | string | 否 | 扩展类型 |
| `status` | string | 否 | 扩展状态 |
| `isLocal` | boolean | 否 | 是否本地开发扩展 |
| `isInstalled` | boolean | 否 | 是否已安装 |

### 1.3 处理流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Extensions List 查询流程                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  1. 检查平台密钥 (Platform Secret)                                    │
│     └─→ dictService.get(DICT_KEYS.PLATFORM_SECRET)                  │
│                                                                       │
│  2. 根据平台密钥决定数据来源                                          │
│     ├─→ 有密钥: getMixedApplicationList() 获取混合列表              │
│     │   ├─→ 远程市场未安装应用                                       │
│     │   └─→ 本地已安装应用                                           │
│     └─→ 无密钥: extensionsService.findAll() 仅获取本地已安装        │
│                                                                       │
│  3. 应用过滤条件                                                      │
│     ├─→ name: 名称模糊匹配（不区分大小写）                           │
│     ├─→ identifier: 标识符模糊匹配                                   │
│     ├─→ type: 类型精确匹配                                           │
│     ├─→ status: 状态精确匹配                                         │
│     ├─→ isLocal: 本地扩展过滤                                        │
│     └─→ isInstalled: 安装状态过滤                                    │
│                                                                       │
│  4. 分页处理                                                          │
│     └─→ paginationResult(list, total, query)                        │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.4 混合列表逻辑 (`getMixedApplicationList`)

**文件位置**: `packages/api/src/modules/extension/services/extension-market.service.ts`

该方法合并了两个数据源：

#### 数据源 1：远程市场扩展
```typescript
// 从远程市场 API 获取可用扩展列表
extensionList = await this.getApplicationList();
// API: GET {EXTENSION_API_URL}/market/lists
```

#### 数据源 2：本地已安装扩展
```typescript
// 从数据库获取已安装扩展
installedExtensions = await this.extensionsService.findAll();
```

#### 合并策略

| 扩展来源 | isInstalled | hasUpdate | 说明 |
|----------|-------------|-----------|------|
| 仅市场存在 | `false` | `false` | 未安装，可安装 |
| 仅本地存在 | `true` | `false` | 本地开发扩展 |
| 两者都有 | `true` | 版本对比 | 比较 semver 版本判断是否有更新 |

#### 版本更新检测
```typescript
// 使用 semver 比较版本
if (semver.valid(marketVersion) && semver.valid(ext.version)) {
    hasUpdate = semver.gt(marketVersion, ext.version);
}
```

### 1.5 响应结构

```typescript
interface PaginationResult<ExtensionFormData> {
    items: ExtensionFormData[];
    total: number;
    page: number;
    pageSize: number;
}

interface ExtensionFormData {
    id: string;
    name: string;
    identifier: string;
    version: string;
    description?: string;
    icon?: string;
    type: ExtensionTypeType;
    supportTerminal?: ExtensionSupportTerminalType[];
    status: ExtensionStatusType;
    author?: { avatar: string; name: string; homepage: string };
    isLocal?: boolean;
    isInstalled?: boolean;      // 是否已安装
    hasUpdate?: boolean;        // 是否有更新
    latestVersion?: string;     // 最新版本号
    createdAt: Date;
    updatedAt: Date;
}
```

---

## 2. 扩展安装接口

### 2.1 接口概述

| 属性 | 说明 |
|------|------|
| **路径** | `POST /consoleapi/extensions/install/:identifier` |
| **权限** | `install` (安装应用) |
| **超时** | 300000ms (5分钟) |
| **功能** | 从远程市场下载并安装扩展 |

### 2.2 请求参数

| 参数名 | 位置 | 类型 | 必填 | 说明 |
|--------|------|------|------|------|
| `identifier` | 路径 | string | 是 | 扩展标识符 |
| `version` | Body | string | 否 | 指定版本，不填则安装最新稳定版 |

### 2.3 完整安装流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Extension Install 完整流程                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ① 获取扩展信息                                                      │
│     └─→ extensionMarketService.getApplicationDetail(identifier)     │
│         API: GET {EXTENSION_API_URL}/market/detail/{identifier}     │
│                                                                       │
│  ② 解析目标版本                                                      │
│     ├─→ 如果指定 version，使用指定版本                              │
│     └─→ 否则调用 resolveLatestVersion() 获取最新稳定版              │
│         ├─→ 过滤有效 semver 版本                                    │
│         ├─→ 降序排序                                                │
│         └─→ 优先返回无预发布标签的稳定版                            │
│                                                                       │
│  ③ 获取下载链接                                                      │
│     └─→ extensionMarketService.downloadApplication(...)             │
│         API: POST {EXTENSION_API_URL}/market/download/{id}/{ver}/install │
│                                                                       │
│  ④ 下载并解压                                                        │
│     └─→ download(url, identifier, INSTALL, version)                 │
│         ├─→ 检查缓存 (storage/temp/{identifier}-{version}.zip)      │
│         ├─→ 下载 ZIP 包                                              │
│         ├─→ 解压到 extensions/{identifier}/ 目录                    │
│         └─→ 验证目录结构 (必须包含 build/ 和 .output/public/)       │
│                                                                       │
│  ⑤ 创建数据库记录                                                    │
│     └─→ extensionsService.create({                                  │
│             name, identifier, version, description, icon,           │
│             type, supportTerminal, author, status: ENABLED,         │
│             isLocal: false                                          │
│         })                                                          │
│                                                                       │
│  ⑥ 更新 extensions.json 配置                                        │
│     └─→ extensionConfigService.addExtension(identifier, config)     │
│                                                                       │
│  ⑦ 复制前端资源                                                      │
│     └─→ copyWebAssets(identifier)                                   │
│         从 extensions/{id}/.output/public → public/web/extensions/{id} │
│                                                                       │
│  ⑧ 安装依赖                                                          │
│     └─→ exec("pnpm install --no-frozen-lockfile")                   │
│                                                                       │
│  ⑨ 同步数据库表和执行种子数据                                        │
│     └─→ synchronizeExtensionTablesAndSeeds(identifier)              │
│         ├─→ 创建扩展专属 schema                                     │
│         ├─→ 同步实体表结构                                          │
│         └─→ 执行种子数据                                            │
│                                                                       │
│  ⑩ 调度 PM2 重启                                                     │
│     └─→ scheduleRestart()                                           │
│         └─→ 3秒防抖，避免频繁重启                                   │
│                                                                       │
│  ⑪ 返回扩展实体                                                      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.4 关键子流程

#### 2.4.1 下载与解压

```typescript
async download(url, identifier, type, version) {
    // 1. 构建缓存文件名
    const baseName = `${safeIdentifier}-${safeVersion}`;
    
    // 2. 检查是否已有缓存（避免重复下载）
    const cachedFilePath = await this.findExistingPackage(baseName);
    if (cachedFilePath) {
        return this.extractPluginPackage(cachedFilePath, identifier, type);
    }
    
    // 3. HTTP 下载 ZIP 包
    const response = await this.httpClient.get(url, { responseType: "arraybuffer" });
    
    // 4. 保存到 storage/temp 目录
    await fs.writeFile(filePath, response.data);
    
    // 5. 解压到 extensions/{identifier} 目录
    const pluginDir = await this.extractPluginPackage(filePath, identifier, type);
    
    return { identifier, version, pluginDir, packagePath };
}
```

#### 2.4.2 目录结构验证

```typescript
private async ensurePluginStructure(targetDir: string) {
    const buildDir = path.join(targetDir, "build");
    const outputPublicDir = path.join(targetDir, ".output", "public");
    
    // 后端编译产物必须存在
    if (!await fs.pathExists(buildDir)) {
        throw HttpErrorFactory.badRequest('Missing "build" directory');
    }
    
    // 前端编译产物必须存在
    if (!await fs.pathExists(outputPublicDir)) {
        throw HttpErrorFactory.badRequest('Missing ".output/public" directory');
    }
}
```

#### 2.4.3 版本解析逻辑

```typescript
private async resolveLatestVersion(identifier, marketService) {
    const versions = await marketService.getApplicationVersions(identifier);
    
    // 过滤有效的 semver 版本
    const validVersions = versions
        .map(v => v.version)
        .filter(v => semver.valid(v));
    
    // 降序排序
    validVersions.sort((a, b) => semver.rcompare(a, b));
    
    // 优先返回稳定版本（无 -alpha, -beta 等预发布标签）
    const latestStable = validVersions.find(v => !semver.prerelease(v));
    
    return latestStable || validVersions[0];
}
```

### 2.5 响应结构

```typescript
interface ExtensionFormData {
    id: string;
    name: string;
    identifier: string;
    version: string;
    description?: string;
    icon?: string;
    type: ExtensionTypeType;
    supportTerminal?: ExtensionSupportTerminalType[];
    status: ExtensionStatusType;  // 默认 ENABLED
    author?: { avatar: string; name: string; homepage: string };
    isLocal: boolean;             // false
    installedAt?: string;
    createdAt: Date;
    updatedAt: Date;
}
```

---

## 3. 相关服务说明

### 3.1 服务依赖关系

```
┌──────────────────────────────┐
│  ExtensionConsoleController  │
└──────────────┬───────────────┘
               │
     ┌─────────┴─────────┐
     ▼                   ▼
┌────────────────┐  ┌─────────────────────────┐
│ ExtensionMarket│  │ ExtensionOperation      │
│ Service        │  │ Service                 │
└───────┬────────┘  └────────────┬────────────┘
        │                        │
        ▼                        ▼
┌────────────────┐  ┌─────────────────────────┐
│ Remote Market  │  │ ExtensionsService       │
│ API            │  │ (Database Operations)   │
└────────────────┘  └─────────────────────────┘
```

### 3.2 核心服务职责

| 服务 | 职责 |
|------|------|
| `ExtensionMarketService` | 与远程市场 API 交互，获取列表/详情/版本/下载链接 |
| `ExtensionOperationService` | 扩展安装/升级/卸载的核心逻辑 |
| `ExtensionsService` | 数据库 CRUD 操作 |
| `ExtensionConfigService` | extensions.json 配置文件管理 |
| `ExtensionSchemaService` | 扩展专属数据库 schema 管理 |
| `Pm2Service` | PM2 进程重启管理 |

---

## 4. 目录结构

```
BuildingAI/
├── extensions/                    # 扩展安装目录
│   └── {identifier}/             # 具体扩展目录
│       ├── build/                # 后端编译产物 ✓ 必须存在
│       ├── .output/public/       # 前端编译产物 ✓ 必须存在
│       ├── src/                  # 源代码
│       ├── data/                 # 数据目录 (升级时保留)
│       ├── storage/              # 存储目录 (升级时保留)
│       └── node_modules/         # 依赖 (升级时保留)
│
├── public/web/extensions/        # 前端资源公共目录
│   └── {identifier}/             # 扩展前端资源 (从 .output/public 复制)
│
├── storage/temp/                 # 下载缓存目录
│   └── {identifier}-{version}.zip
│
└── extensions.json               # 扩展配置文件
```

---

## 5. 前端调用示例

### 5.1 查询扩展列表

```typescript
import { apiGetExtensionList } from "@buildingai/service/consoleapi/extensions";

// 查询未安装的扩展
const { items, total } = await apiGetExtensionList({
    page: 1,
    pageSize: 15,
    isInstalled: false,
});

// 查询已安装的本地扩展
const localExtensions = await apiGetExtensionList({
    page: 1,
    pageSize: 10,
    isInstalled: true,
    isLocal: true,
});
```

### 5.2 安装扩展

```typescript
import { apiInstallExtension } from "@buildingai/service/consoleapi/extensions";

// 安装最新版本
const extension = await apiInstallExtension("buildingai-xhs-creator");

// 安装指定版本
const extensionV2 = await apiInstallExtension("buildingai-xhs-creator", "2.0.0");
```

---

## 6. 错误处理

| 错误场景 | 错误类型 | 说明 |
|----------|----------|------|
| 扩展不存在 | `NotFound` | 市场中找不到指定 identifier 的扩展 |
| 无可用版本 | `BadRequest` | 扩展没有任何可用版本 |
| 下载失败 | `BadRequest` | 网络问题或市场服务异常 |
| 包结构无效 | `BadRequest` | 缺少 build/ 或 .output/public/ 目录 |
| 依赖安装失败 | `Internal` | pnpm install 执行失败 |
| 平台密钥无效 | `BadRequest` | 密钥验证失败 |

---

## 7. 升级与卸载

### 7.1 升级接口

```
POST /consoleapi/extensions/upgrade/:identifier
```

升级时会保留以下目录：
- `data/` - 数据目录
- `storage/` - 存储目录
- `node_modules/` - 依赖目录

### 7.2 卸载接口

```
DELETE /consoleapi/extensions/uninstall/:identifier
```

卸载流程：
1. 删除扩展目录
2. 移除前端资源
3. 更新 extensions.json
4. 删除文件记录
5. 删除数据库 schema
6. 删除数据库记录
7. 重启 PM2

---

> **文档版本**: 1.0.0  
> **最后更新**: 2025-12-07  
> **相关文件**:  
> - `packages/api/src/modules/extension/controllers/console/extension.controller.ts`
> - `packages/api/src/modules/extension/services/extension-operation.service.ts`
> - `packages/api/src/modules/extension/services/extension-market.service.ts`
> - `packages/web/@buildingai/service/src/consoleapi/extensions.ts`
