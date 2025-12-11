import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Subject } from "rxjs";

/**
 * SSE 连接信息
 */
interface SseConnection {
    /** 连接ID */
    id: string;
    /** 用户ID */
    userId: string;
    /** 任务ID */
    taskId: string;
    /** Subject 实例 */
    subject: Subject<MessageEvent>;
    /** 创建时间 */
    createdAt: Date;
    /** 最后活动时间 */
    lastActiveAt: Date;
    /** 心跳定时器 */
    heartbeatTimer?: NodeJS.Timeout;
}

/**
 * SSE 连接池管理服务
 * 管理 SSE 连接生命周期，支持心跳和自动清理
 */
@Injectable()
export class SseConnectionPoolService implements OnModuleDestroy {
    private readonly logger = new Logger(SseConnectionPoolService.name);

    /** 连接存储 */
    private readonly connections = new Map<string, SseConnection>();

    /** 心跳间隔（毫秒） */
    private readonly HEARTBEAT_INTERVAL = 30 * 1000;

    /** 连接超时（毫秒） */
    private readonly CONNECTION_TIMEOUT = 10 * 60 * 1000;

    /** 清理定时器 */
    private cleanupTimer: NodeJS.Timeout | null = null;

    constructor() {
        // 启动定期清理
        this.cleanupTimer = setInterval(() => {
            this.cleanupStaleConnections();
        }, 60 * 1000);
    }

    onModuleDestroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        // 关闭所有连接
        for (const conn of this.connections.values()) {
            this.closeConnection(conn.id);
        }
    }

    /**
     * 创建新连接
     */
    createConnection(
        userId: string,
        taskId: string,
    ): { id: string; subject: Subject<MessageEvent> } {
        const id = `sse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const subject = new Subject<MessageEvent>();
        const now = new Date();

        const connection: SseConnection = {
            id,
            userId,
            taskId,
            subject,
            createdAt: now,
            lastActiveAt: now,
        };

        // 设置心跳
        connection.heartbeatTimer = setInterval(() => {
            this.sendHeartbeat(id);
        }, this.HEARTBEAT_INTERVAL);

        this.connections.set(id, connection);
        this.logger.log(`创建 SSE 连接: ${id} (用户: ${userId}, 任务: ${taskId})`);

        return { id, subject };
    }

    /**
     * 获取连接
     */
    getConnection(id: string): SseConnection | undefined {
        return this.connections.get(id);
    }

    /**
     * 获取用户的所有连接
     */
    getUserConnections(userId: string): SseConnection[] {
        return Array.from(this.connections.values()).filter(
            (conn) => conn.userId === userId,
        );
    }

    /**
     * 获取任务的连接
     */
    getTaskConnection(taskId: string): SseConnection | undefined {
        return Array.from(this.connections.values()).find(
            (conn) => conn.taskId === taskId,
        );
    }

    /**
     * 发送心跳
     */
    private sendHeartbeat(connectionId: string): void {
        const conn = this.connections.get(connectionId);
        if (!conn) return;

        try {
            conn.subject.next({
                data: JSON.stringify({ type: "heartbeat", timestamp: Date.now() }),
            } as MessageEvent);
            conn.lastActiveAt = new Date();
        } catch (error) {
            this.logger.warn(`心跳发送失败: ${connectionId}`);
            this.closeConnection(connectionId);
        }
    }

    /**
     * 关闭连接
     */
    closeConnection(id: string): boolean {
        const conn = this.connections.get(id);
        if (!conn) return false;

        if (conn.heartbeatTimer) {
            clearInterval(conn.heartbeatTimer);
        }

        try {
            conn.subject.complete();
        } catch {}

        this.connections.delete(id);
        this.logger.log(`关闭 SSE 连接: ${id}`);
        return true;
    }

    /**
     * 更新连接活动时间
     */
    updateActivity(id: string): void {
        const conn = this.connections.get(id);
        if (conn) {
            conn.lastActiveAt = new Date();
        }
    }

    /**
     * 清理过期连接
     */
    private cleanupStaleConnections(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [id, conn] of this.connections) {
            const age = now - conn.lastActiveAt.getTime();
            if (age > this.CONNECTION_TIMEOUT) {
                this.closeConnection(id);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logger.log(`清理了 ${cleaned} 个过期 SSE 连接`);
        }
    }

    /**
     * 获取连接池状态
     */
    getPoolStatus(): {
        totalConnections: number;
        connectionsByUser: Record<string, number>;
    } {
        const connectionsByUser: Record<string, number> = {};
        for (const conn of this.connections.values()) {
            connectionsByUser[conn.userId] = (connectionsByUser[conn.userId] || 0) + 1;
        }

        return {
            totalConnections: this.connections.size,
            connectionsByUser,
        };
    }
}
