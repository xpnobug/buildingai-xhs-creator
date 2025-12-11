import { Injectable, Logger } from "@nestjs/common";

/**
 * 熔断器状态
 */
enum CircuitState {
    /** 正常状态 */
    CLOSED = "closed",
    /** 熔断状态 */
    OPEN = "open",
    /** 半开状态（尝试恢复） */
    HALF_OPEN = "half_open",
}

/**
 * 熔断器配置
 */
interface CircuitBreakerConfig {
    /** 失败阈值，达到后触发熔断 */
    failureThreshold: number;
    /** 成功阈值，半开状态下达到后恢复 */
    successThreshold: number;
    /** 熔断持续时间（毫秒） */
    openDuration: number;
    /** 超时时间（毫秒） */
    timeout: number;
}

/**
 * 熔断器服务
 * 保护外部 AI 服务调用，防止级联故障
 */
@Injectable()
export class CircuitBreakerService {
    private readonly logger = new Logger(CircuitBreakerService.name);

    /** 各服务的熔断器状态 */
    private readonly circuits = new Map<string, {
        state: CircuitState;
        failureCount: number;
        successCount: number;
        lastFailureTime: number;
        nextAttemptTime: number;
    }>();

    /** 默认配置 */
    private readonly defaultConfig: CircuitBreakerConfig = {
        failureThreshold: 5,
        successThreshold: 2,
        openDuration: 60 * 1000, // 1分钟
        timeout: 30 * 1000, // 30秒
    };

    /**
     * 获取或初始化熔断器
     */
    private getCircuit(serviceName: string) {
        if (!this.circuits.has(serviceName)) {
            this.circuits.set(serviceName, {
                state: CircuitState.CLOSED,
                failureCount: 0,
                successCount: 0,
                lastFailureTime: 0,
                nextAttemptTime: 0,
            });
        }
        return this.circuits.get(serviceName)!;
    }

    /**
     * 检查服务是否可用
     */
    isAvailable(serviceName: string): boolean {
        const circuit = this.getCircuit(serviceName);
        const now = Date.now();

        switch (circuit.state) {
            case CircuitState.CLOSED:
                return true;

            case CircuitState.OPEN:
                if (now >= circuit.nextAttemptTime) {
                    circuit.state = CircuitState.HALF_OPEN;
                    circuit.successCount = 0;
                    this.logger.log(`[${serviceName}] 熔断器进入半开状态`);
                    return true;
                }
                return false;

            case CircuitState.HALF_OPEN:
                return true;

            default:
                return true;
        }
    }

    /**
     * 执行受保护的操作
     */
    async execute<T>(
        serviceName: string,
        operation: () => Promise<T>,
        config?: Partial<CircuitBreakerConfig>,
    ): Promise<T> {
        const mergedConfig = { ...this.defaultConfig, ...config };
        const circuit = this.getCircuit(serviceName);

        if (!this.isAvailable(serviceName)) {
            throw new Error(`服务 ${serviceName} 暂时不可用（熔断中）`);
        }

        try {
            // 带超时执行
            const result = await Promise.race([
                operation(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("操作超时")), mergedConfig.timeout),
                ),
            ]);

            this.recordSuccess(serviceName, mergedConfig);
            return result;
        } catch (error) {
            this.recordFailure(serviceName, mergedConfig);
            throw error;
        }
    }

    /**
     * 记录成功
     */
    private recordSuccess(serviceName: string, config: CircuitBreakerConfig): void {
        const circuit = this.getCircuit(serviceName);

        if (circuit.state === CircuitState.HALF_OPEN) {
            circuit.successCount++;
            if (circuit.successCount >= config.successThreshold) {
                circuit.state = CircuitState.CLOSED;
                circuit.failureCount = 0;
                this.logger.log(`[${serviceName}] 熔断器恢复正常`);
            }
        } else {
            circuit.failureCount = 0;
        }
    }

    /**
     * 记录失败
     */
    private recordFailure(serviceName: string, config: CircuitBreakerConfig): void {
        const circuit = this.getCircuit(serviceName);
        const now = Date.now();

        circuit.failureCount++;
        circuit.lastFailureTime = now;

        if (circuit.state === CircuitState.HALF_OPEN) {
            // 半开状态下失败，重新熔断
            circuit.state = CircuitState.OPEN;
            circuit.nextAttemptTime = now + config.openDuration;
            this.logger.warn(`[${serviceName}] 熔断器重新熔断`);
        } else if (circuit.failureCount >= config.failureThreshold) {
            // 达到阈值，触发熔断
            circuit.state = CircuitState.OPEN;
            circuit.nextAttemptTime = now + config.openDuration;
            this.logger.warn(`[${serviceName}] 熔断器触发，失败次数: ${circuit.failureCount}`);
        }
    }

    /**
     * 获取服务状态
     */
    getStatus(serviceName: string): {
        state: string;
        failureCount: number;
        isAvailable: boolean;
    } {
        const circuit = this.getCircuit(serviceName);
        return {
            state: circuit.state,
            failureCount: circuit.failureCount,
            isAvailable: this.isAvailable(serviceName),
        };
    }

    /**
     * 重置熔断器
     */
    reset(serviceName: string): void {
        this.circuits.delete(serviceName);
        this.logger.log(`[${serviceName}] 熔断器已重置`);
    }
}
