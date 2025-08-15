import { BytebotAgentModel } from '../agent/agent.types';

export const VLLM_MODELS: BytebotAgentModel[] = [
  {
    provider: 'vllm',
    name: 'unsloth/Qwen3-8B-unsloth-bnb-4bit', // make a better var management or user input model
    title: 'VLLM Kitty',
    contextWindow: 8000,
  },
  {
    provider: 'proxy',
    name: 'unsloth/Qwen3-8B-unsloth-bnb-4bit',
    title: 'VLLM Kitty (Proxy)',
    contextWindow: 8000,
  },
];

export const DEFAULT_MODEL = VLLM_MODELS[0];
