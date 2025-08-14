import { BytebotAgentModel } from '../agent/agent.types';

export const VLLM_MODELS: BytebotAgentModel[] = [
  {
    provider: 'vllm',
    name: 'kitty',
    title: 'VLLM Kitty',
    contextWindow: 10000,
  },
  {
    provider: 'proxy',
    name: 'kitty',
    title: 'VLLM Kitty (Proxy)',
    contextWindow: 10000,
  },
];

export const DEFAULT_MODEL = VLLM_MODELS[0];
