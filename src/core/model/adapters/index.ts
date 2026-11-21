import type { EffectiveProvider } from '../../config/effective.js';
import type { ProviderAdapter } from '../gateway.js';
import { anthropicMessagesAdapter } from './anthropic-messages.js';
import { openAiChatAdapter } from './openai-chat.js';

/**
 * The provider adapters of the first version, one per provider API of C001-REQ-805 (C001-IF-010
 * §4, §5). Registering them with the gateway sends nothing by itself: the gateway calls an adapter
 * only after the egress policy of §6 (C001-T-088) has allowed the request, and without that policy
 * every request stays model-free ('gateway-incomplete').
 */
export const PROVIDER_ADAPTERS: Readonly<Record<EffectiveProvider['api'], ProviderAdapter>> = {
  'openai-chat': openAiChatAdapter,
  'anthropic-messages': anthropicMessagesAdapter,
};
