import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Only initialize if environment variables are present
const isConfigured = 
  process.env.UPSTASH_REDIS_REST_URL && 
  process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = isConfigured 
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

/**
 * Auth Rate Limiter
 * 10 requests per 15 minutes per IP
 */
export const authLimiter = isConfigured && redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "15 m"),
      analytics: true,
      prefix: "envault_auth",
    })
  : { limit: () => Promise.resolve({ success: true, reset: Date.now() + 900000 }) };

/**
 * Share Access Rate Limiter
 * 20 requests per hour per IP
 */
export const shareLimiter = isConfigured && redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 h"),
      analytics: true,
      prefix: "envault_share",
    })
  : { limit: () => Promise.resolve({ success: true, reset: Date.now() + 3600000 }) };

/**
 * Salt Fetch Rate Limiter (brute force protection for vault unlock)
 * 5 requests per minute per User
 */
export const saltLimiter = isConfigured && redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
      analytics: true,
      prefix: "envault_salt",
    })
  : { limit: () => Promise.resolve({ success: true, reset: Date.now() + 60000 }) };

/**
 * Sharing Invite Creation Rate Limiter
 * 5 invites per hour per user
 */
export const sharingInviteLimiter = isConfigured && redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      analytics: true,
      prefix: "envault_sharing_invite",
    })
  : { limit: () => Promise.resolve({ success: true, reset: Date.now() + 3600000 }) };

/**
 * Sharing Invite Accept Rate Limiter
 * 10 accepts per hour per user
 */
export const sharingAcceptLimiter = isConfigured && redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: true,
      prefix: "envault_sharing_accept",
    })
  : { limit: () => Promise.resolve({ success: true, reset: Date.now() + 3600000 }) };

/**
 * Sharing Token Validation Rate Limiter (brute force protection)
 * 20 requests per hour per IP
 */
export const sharingTokenLimiter = isConfigured && redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 h"),
      analytics: true,
      prefix: "envault_sharing_token",
    })
  : { limit: () => Promise.resolve({ success: true, reset: Date.now() + 3600000 }) };

/**
 * Password reset request limiter
 * 5 requests per hour per IP/email key
 */
export const passwordResetLimiter = isConfigured && redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      analytics: true,
      prefix: "envault_password_reset",
    })
  : { limit: () => Promise.resolve({ success: true, reset: Date.now() + 3600000 }) };
