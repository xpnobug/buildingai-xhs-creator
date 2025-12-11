# 架构决策记录 (ADR)

## ADR-001: 服务层拆分策略

**日期**: 2024-12

**状态**: 已采纳

**背景**: `ImageService` 单文件超过 700 行，职责过多难以维护。

**决策**: 采用 Facade 模式拆分为：
- `ImageService` - 门面，对外接口不变
- `ImagePromptService` - Prompt 构建
- `ImageGenerationService` - 核心生成逻辑

**后果**: 
- ✅ 代码可读性提升
- ✅ 单元测试更容易
- ⚠️ 依赖注入略微复杂

---

## ADR-002: SSE 事件类型定义

**日期**: 2024-12

**状态**: 已采纳

**背景**: SSE 事件类型散落各处，缺乏统一定义。

**决策**: 创建 `sse-events.ts` 定义所有 SSE 事件接口。

**后果**:
- ✅ 类型安全
- ✅ 前后端共享类型

---

## ADR-003: 统一异常处理

**日期**: 2024-12

**状态**: 已采纳

**背景**: 错误处理不一致，难以前端展示友好错误信息。

**决策**: 
- 创建 `XhsException` 基类 + 17 个错误码
- 实现 `XhsExceptionFilter` 全局过滤器

**后果**:
- ✅ 错误码标准化
- ✅ 日志更易追踪
- ✅ 前端可根据错误码个性化处理

---

## ADR-004: 前端 Store 拆分

**日期**: 2024-12

**状态**: 已采纳

**背景**: `xhs-creator.ts` Store 近 500 行，职责混杂。

**决策**: 拆分为模块化 Store：
- `useOutlineStore` - 大纲管理
- `useImageGenerationStore` - 图片生成
- `useXhsCreatorStore` - 组合 Store

**后果**:
- ✅ 状态管理更清晰
- ✅ 便于按需导入
