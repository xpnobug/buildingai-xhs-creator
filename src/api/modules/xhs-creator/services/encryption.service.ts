import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";

/**
 * 加密算法配置
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * 加密结果
 */
export interface EncryptionResult {
    /** 加密后的数据（Base64） */
    encryptedData: string;
    /** 初始化向量（Base64） */
    iv: string;
    /** 认证标签（Base64） */
    authTag: string;
    /** 盐值（Base64） */
    salt: string;
}

/**
 * 敏感数据加密服务
 * 
 * 使用 AES-256-GCM 加密算法保护敏感数据，如：
 * - API 密钥
 * - 用户凭据
 * - 支付信息
 */
@Injectable()
export class EncryptionService {
    private readonly logger = new Logger(EncryptionService.name);
    private readonly masterKey: Buffer;

    constructor() {
        // 从环境变量获取主密钥
        const masterKeyHex = process.env.ENCRYPTION_MASTER_KEY;
        if (!masterKeyHex) {
            this.logger.warn("未设置 ENCRYPTION_MASTER_KEY 环境变量，使用默认密钥（仅用于开发）");
            // 开发环境使用固定密钥，生产环境必须设置
            this.masterKey = crypto.scryptSync("development-key", "salt", KEY_LENGTH);
        } else {
            this.masterKey = Buffer.from(masterKeyHex, "hex");
        }
    }

    /**
     * 加密敏感数据
     */
    encrypt(plainText: string): EncryptionResult {
        // 生成随机盐和 IV
        const salt = crypto.randomBytes(SALT_LENGTH);
        const iv = crypto.randomBytes(IV_LENGTH);

        // 派生加密密钥
        const key = crypto.pbkdf2Sync(this.masterKey, salt, ITERATIONS, KEY_LENGTH, "sha256");

        // 使用 AES-256-GCM 加密
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
            authTagLength: AUTH_TAG_LENGTH,
        } as crypto.CipherGCMOptions);

        let encrypted = cipher.update(plainText, "utf8", "base64");
        encrypted += cipher.final("base64");

        const authTag = cipher.getAuthTag();

        return {
            encryptedData: encrypted,
            iv: iv.toString("base64"),
            authTag: authTag.toString("base64"),
            salt: salt.toString("base64"),
        };
    }

    /**
     * 解密敏感数据
     */
    decrypt(encryptionResult: EncryptionResult): string {
        const { encryptedData, iv, authTag, salt } = encryptionResult;

        // 还原盐和 IV
        const saltBuffer = Buffer.from(salt, "base64");
        const ivBuffer = Buffer.from(iv, "base64");
        const authTagBuffer = Buffer.from(authTag, "base64");

        // 派生解密密钥
        const key = crypto.pbkdf2Sync(this.masterKey, saltBuffer, ITERATIONS, KEY_LENGTH, "sha256");

        // 使用 AES-256-GCM 解密
        const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer, {
            authTagLength: AUTH_TAG_LENGTH,
        } as crypto.CipherGCMOptions);

        decipher.setAuthTag(authTagBuffer);

        let decrypted = decipher.update(encryptedData, "base64", "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
    }

    /**
     * 加密为单一字符串（方便存储）
     */
    encryptToString(plainText: string): string {
        const result = this.encrypt(plainText);
        // 格式: salt:iv:authTag:encryptedData
        return `${result.salt}:${result.iv}:${result.authTag}:${result.encryptedData}`;
    }

    /**
     * 从单一字符串解密
     */
    decryptFromString(encryptedString: string): string {
        const parts = encryptedString.split(":");
        if (parts.length !== 4) {
            throw new Error("无效的加密字符串格式");
        }

        const [salt, iv, authTag, encryptedData] = parts;
        return this.decrypt({ salt, iv, authTag, encryptedData });
    }

    /**
     * 哈希敏感数据（不可逆，用于比较）
     */
    hash(data: string): string {
        return crypto
            .createHash("sha256")
            .update(data)
            .update(this.masterKey)
            .digest("hex");
    }

    /**
     * 生成安全的随机令牌
     */
    generateToken(length: number = 32): string {
        return crypto.randomBytes(length).toString("hex");
    }

    /**
     * 掩码敏感数据（用于日志显示）
     */
    mask(data: string, visibleChars: number = 4): string {
        if (!data || data.length <= visibleChars * 2) {
            return "****";
        }
        const start = data.slice(0, visibleChars);
        const end = data.slice(-visibleChars);
        const masked = "*".repeat(Math.min(data.length - visibleChars * 2, 8));
        return `${start}${masked}${end}`;
    }
}
