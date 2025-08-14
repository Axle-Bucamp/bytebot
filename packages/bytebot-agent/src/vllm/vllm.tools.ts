import { agentTools } from '../agent/agent.tools';

/**
 * Converts an agent tool definition to a VLLM tool format
 */
function agentToolToVllmTool(agentTool: any): {
  name: string;
  description: string;
  parameters: any;
} {
  return {
    name: agentTool.name,
    description: agentTool.description,
    parameters: agentTool.input_schema,
  };
}

/**
 * Creates VLLM tools from agent tools
 */
export const vllmTools = agentTools.map(agentToolToVllmTool);

// Export individual tools for backward compatibility
export const moveMouseTool = vllmTools.find(tool => tool.name === 'move_mouse');
export const traceMouseTool = vllmTools.find(tool => tool.name === 'trace_mouse');
export const clickMouseTool = vllmTools.find(tool => tool.name === 'click_mouse');
export const pressMouseTool = vllmTools.find(tool => tool.name === 'press_mouse');
export const dragMouseTool = vllmTools.find(tool => tool.name === 'drag_mouse');
export const scrollTool = vllmTools.find(tool => tool.name === 'scroll');
export const typeKeysTool = vllmTools.find(tool => tool.name === 'type_keys');
export const pressKeysTool = vllmTools.find(tool => tool.name === 'press_keys');
export const typeTextTool = vllmTools.find(tool => tool.name === 'type_text');
export const pasteTextTool = vllmTools.find(tool => tool.name === 'paste_text');
export const waitTool = vllmTools.find(tool => tool.name === 'wait');
export const screenshotTool = vllmTools.find(tool => tool.name === 'screenshot');
export const cursorPositionTool = vllmTools.find(tool => tool.name === 'cursor_position');
export const setTaskStatusTool = vllmTools.find(tool => tool.name === 'set_task_status');
export const createTaskTool = vllmTools.find(tool => tool.name === 'create_task');
export const applicationTool = vllmTools.find(tool => tool.name === 'application');
