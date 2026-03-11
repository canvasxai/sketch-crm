/**
 * AWS Bedrock client factory for AI-powered features.
 * Returns null if AWS credentials are not configured.
 */

import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import type { Config } from "../config.js";

let instance: AnthropicBedrock | null = null;

export function createBedrockClient(config: Config): AnthropicBedrock | null {
  if (instance) return instance;

  if (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY || !config.AWS_REGION) {
    return null;
  }

  instance = new AnthropicBedrock({
    awsAccessKey: config.AWS_ACCESS_KEY_ID,
    awsSecretKey: config.AWS_SECRET_ACCESS_KEY,
    awsRegion: config.AWS_REGION,
  });

  return instance;
}
