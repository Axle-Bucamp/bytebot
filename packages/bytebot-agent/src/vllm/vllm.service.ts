import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isComputerToolUseContentBlock,
  isImageContentBlock,
  isUserActionContentBlock,
  MessageContentBlock,
  MessageContentType,
  TextContentBlock,
  ToolUseContentBlock,
} from '@bytebot/shared';
import {
  BytebotAgentService,
  BytebotAgentInterrupt,
  BytebotAgentResponse,
} from '../agent/agent.types';
import { Message, Role } from '@prisma/client';
import { vllmTools } from './vllm.tools';
import { v4 as uuid } from 'uuid';
import { DEFAULT_MODEL } from './vllm.constants';

interface VllmRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string | Array<{
      type: 'text' | 'image_url' | 'function_call' | 'function_response';
      text?: string;
      image_url?: { url: string };
      function_call?: { name: string; arguments: string };
      function_response?: { name: string; content: string };
    }>;
  }>;
  max_tokens?: number;
  temperature?: number;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }>;
  tool_choice?: 'auto' | 'none';
  stream?: boolean;
}

interface VllmResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | Array<{
        type: 'text' | 'function_call';
        text?: string;
        function_call?: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

@Injectable()
export class VllmService implements BytebotAgentService {
  private readonly logger = new Logger(VllmService.name);
  private readonly apiBase: string;
  private readonly apiKey?: string;

  constructor(private readonly configService: ConfigService) {
    this.apiBase = this.configService.get<string>('VLLM_API_BASE') || 'https://kitty.guidry-cloud.com';
    this.apiKey = this.configService.get<string>('VLLM_API_KEY');
    
    if (!this.apiKey) {
      this.logger.warn('VLLM_API_KEY is not set. VLLM service may not work properly.');
    }
  }

  async generateMessage(
    systemPrompt: string,
    messages: Message[],
    model: string = DEFAULT_MODEL.name,
    useTools: boolean = true,
    signal?: AbortSignal,
  ): Promise<BytebotAgentResponse> {
    try {
      const maxTokens = 8192;

      // Convert our message content blocks to VLLM's expected format
      const vllmMessages = this.formatMessagesForVllm(messages, systemPrompt);

      const requestBody: VllmRequest = {
        model,
        messages: vllmMessages,
        max_tokens: maxTokens,
        temperature: 0.7,
        stream: false,
      };

      if (useTools) {
        requestBody.tools = vllmTools.map(tool => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        }));
        requestBody.tool_choice = 'auto';
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const controller = new AbortController();
      if (signal) {
        signal.addEventListener('abort', () => controller.abort());
      }

      const response = await fetch(`${this.apiBase}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`VLLM API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const vllmResponse: VllmResponse = await response.json();

      if (!vllmResponse.choices || vllmResponse.choices.length === 0) {
        throw new Error('No choices found in VLLM response');
      }

      const choice = vllmResponse.choices[0];
      const message = choice.message;

      return {
        contentBlocks: this.formatVllmResponse(message.content),
        tokenUsage: {
          inputTokens: vllmResponse.usage?.prompt_tokens || 0,
          outputTokens: vllmResponse.usage?.completion_tokens || 0,
          totalTokens: vllmResponse.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      if (error.name === 'AbortError' || error.message.includes('AbortError')) {
        throw new BytebotAgentInterrupt();
      }
      this.logger.error(
        `Error sending message to VLLM: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Convert our MessageContentBlock format to VLLM's message format
   */
  private formatMessagesForVllm(messages: Message[], systemPrompt: string): Array<{
    role: 'user' | 'assistant' | 'system';
    content: string | Array<{
      type: 'text' | 'image_url' | 'function_call' | 'function_response';
      text?: string;
      image_url?: { url: string };
      function_call?: { name: string; arguments: string };
      function_response?: { name: string; content: string };
    }>;
  }> {
    const vllmMessages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string | Array<{
        type: 'text' | 'image_url' | 'function_call' | 'function_response';
        text?: string;
        image_url?: { url: string };
        function_call?: { name: string; arguments: string };
        function_response?: { name: string; content: string };
      }>;
    }> = [];

    // Add system message if provided
    if (systemPrompt) {
      vllmMessages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Process each message content block
    for (const message of messages) {
      const messageContentBlocks = message.content as MessageContentBlock[];
      const parts: Array<{
        type: 'text' | 'image_url' | 'function_call' | 'function_response';
        text?: string;
        image_url?: { url: string };
        function_call?: { name: string; arguments: string };
        function_response?: { name: string; content: string };
      }> = [];

      if (messageContentBlocks.every((block) => isUserActionContentBlock(block))) {
        const userActionContentBlocks = messageContentBlocks.flatMap(
          (block) => block.content,
        );
        for (const block of userActionContentBlocks) {
          if (isComputerToolUseContentBlock(block)) {
            parts.push({
              type: 'text',
              text: `User performed action: ${block.name}\n${JSON.stringify(block.input, null, 2)}`,
            });
          } else if (isImageContentBlock(block)) {
            parts.push({
              type: 'image_url',
              image_url: {
                url: `data:${block.source.media_type};base64,${block.source.data}`,
              },
            });
          }
        }
      } else {
        for (const block of messageContentBlocks) {
          switch (block.type) {
            case MessageContentType.Text:
              parts.push({
                type: 'text',
                text: block.text,
              });
              break;
            case MessageContentType.ToolUse:
              parts.push({
                type: 'function_call',
                function_call: {
                  name: block.name,
                  arguments: JSON.stringify(block.input),
                },
              });
              break;
            case MessageContentType.Image:
              parts.push({
                type: 'image_url',
                image_url: {
                  url: `data:${block.source.media_type};base64,${block.source.data}`,
                },
              });
              break;
            case MessageContentType.ToolResult: {
              const toolResultContentBlock = block.content[0];
              if (toolResultContentBlock.type === MessageContentType.Image) {
                parts.push({
                  type: 'function_response',
                  function_response: {
                    name: 'screenshot',
                    content: 'screenshot successful',
                  },
                });
                parts.push({
                  type: 'image_url',
                  image_url: {
                    url: `data:${toolResultContentBlock.source.media_type};base64,${toolResultContentBlock.source.data}`,
                  },
                });
                break;
              }

              parts.push({
                type: 'function_response',
                function_response: {
                  name: this.getToolName(block.tool_use_id, messages) || 'unknown_tool',
                  content: block.is_error ? JSON.stringify(block.content[0]) : JSON.stringify(block.content[0]),
                },
              });
              break;
            }
            default:
              parts.push({
                type: 'text',
                text: JSON.stringify(block),
              });
              break;
          }
        }
      }

      // If we have multiple parts, use the array format, otherwise use string format
      const content = parts.length === 1 && parts[0].type === 'text' 
        ? parts[0].text! 
        : parts;

      vllmMessages.push({
        role: message.role === Role.USER ? 'user' : 'assistant',
        content,
      });
    }

    return vllmMessages;
  }

  // Find the content block with the tool_use_id and return the name
  private getToolName(
    tool_use_id: string,
    messages: Message[],
  ): string | undefined {
    const toolMessage = messages.find((message) =>
      (message.content as MessageContentBlock[]).some(
        (block) =>
          block.type === MessageContentType.ToolUse && block.id === tool_use_id,
      ),
    );
    if (!toolMessage) {
      return undefined;
    }

    const toolBlock = (toolMessage.content as MessageContentBlock[]).find(
      (block) =>
        block.type === MessageContentType.ToolUse && block.id === tool_use_id,
    );
    if (!toolBlock) {
      return undefined;
    }
    return (toolBlock as ToolUseContentBlock).name;
  }

  /**
   * Convert VLLM's response content to our MessageContentBlock format
   */
  private formatVllmResponse(content: string | Array<{
    type: 'text' | 'function_call';
    text?: string;
    function_call?: {
      name: string;
      arguments: string;
    };
  }>): MessageContentBlock[] {
    if (typeof content === 'string') {
      return [{
        type: MessageContentType.Text,
        text: content,
      } as TextContentBlock];
    }

    return content.map((part) => {
      if (part.type === 'text' && part.text) {
        return {
          type: MessageContentType.Text,
          text: part.text,
        } as TextContentBlock;
      }

      if (part.type === 'function_call' && part.function_call) {
        return {
          type: MessageContentType.ToolUse,
          id: uuid(),
          name: part.function_call.name,
          input: JSON.parse(part.function_call.arguments),
        } as ToolUseContentBlock;
      }

      this.logger.warn(`Unknown content type from VLLM: ${JSON.stringify(part)}`);
      return {
        type: MessageContentType.Text,
        text: JSON.stringify(part),
      } as TextContentBlock;
    });
  }
}
