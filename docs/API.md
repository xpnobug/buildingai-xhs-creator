# XHS Creator API 文档

## 概述
小红书图文生成插件 API 接口文档。

---

## 大纲生成

### POST `/api/outline/generate`
生成图文大纲。

**请求体:**
```json
{
  "topic": "如何制作美味的咖啡",
  "userImages": ["https://example.com/image1.jpg"]
}
```

**响应:**
```json
{
  "taskId": "uuid-task-id",
  "outline": "# 咖啡制作指南\n\n## 封面\n...",
  "pages": [
    { "index": 0, "type": "cover", "content": "封面内容..." },
    { "index": 1, "type": "content", "content": "内容页1..." },
    { "index": 2, "type": "summary", "content": "总结页..." }
  ]
}
```

---

## 图片生成

### GET `/api/images/generate` (SSE)
批量生成图片，使用 Server-Sent Events 返回进度。

**查询参数:**
- `taskId` - 任务ID
- `pages` - 页面数据 (JSON)
- `fullOutline` - 完整大纲
- `isRegenerate` - 是否批量重绘

**SSE 事件格式:**
```
data: {"type":"progress","stage":"content","current":1,"total":5,"message":"正在生成第1页..."}

data: {"type":"complete","pageIndex":0,"imageUrl":"https://..."}

data: {"type":"error","pageIndex":1,"message":"生成失败"}

data: {"type":"finish","message":"全部完成"}
```

---

### POST `/api/images/regenerate`
重新生成单张图片。

**请求体:**
```json
{
  "taskId": "uuid-task-id",
  "pageIndex": 0,
  "prompt": "生成一张咖啡主题封面"
}
```

**响应 (SSE):**
```
data: {"type":"start","pageIndex":0}
data: {"type":"complete","pageIndex":0,"imageUrl":"https://..."}
data: {"type":"finish"}
```

---

## 任务管理

### GET `/api/tasks`
获取任务列表。

**响应:**
```json
{
  "tasks": [
    {
      "id": "uuid",
      "topic": "咖啡制作",
      "status": "completed",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### GET `/api/tasks/:id`
获取任务详情。

### GET `/api/tasks/:id/images`
获取任务的所有图片。

### GET `/api/tasks/:id/progress`
获取任务生成进度（用于 SSE 重连恢复）。

---

## 版本管理

### GET `/api/images/:taskId/:pageIndex/versions`
获取图片版本历史。

### POST `/api/images/:taskId/:pageIndex/restore/:version`
恢复到指定版本。

---

## 错误码

| 错误码 | HTTP 状态 | 描述 |
|--------|-----------|------|
| XHS_2001 | 404 | 任务不存在 |
| XHS_3001 | 404 | 图片不存在 |
| XHS_4001 | 402 | 余额不足 |
| XHS_6001 | 503 | AI服务不可用 |
