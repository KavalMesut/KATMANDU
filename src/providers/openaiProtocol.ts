export type OpenAIProtocol = 'chat-completions' | 'responses';

export interface OpenAIMessage {
  role: string;
  content: string | unknown[];
}

export function buildOpenAIRequest(model: string, messages: OpenAIMessage[], effort: string | undefined, protocol: OpenAIProtocol) {
  if (protocol === 'chat-completions') {
    return {
      model,
      messages,
      response_format: { type: 'json_object' },
      ...(effort ? { reasoning_effort: effort } : {})
    };
  }

  return {
    model,
    input: messages.map(message => ({
      role: message.role,
      content: typeof message.content === 'string' ? message.content : message.content.map(raw => {
        const part = raw as Record<string, unknown>;
        if (part.type === 'text') return { type: 'input_text', text: part.text };
        if (part.type === 'image_url') {
          const image = part.image_url as { url: string };
          return { type: 'input_image', image_url: image.url };
        }
        if (part.type === 'file') {
          const file = part.file as { filename: string; file_data: string };
          return { type: 'input_file', filename: file.filename, file_data: file.file_data };
        }
        return part;
      })
    })),
    text: { format: { type: 'json_object' } },
    ...(effort ? { reasoning: { effort } } : {})
  };
}

export function extractOpenAIText(data: unknown, protocol: OpenAIProtocol): string {
  const result = data as Record<string, unknown>;
  if (protocol === 'chat-completions') {
    const choices = result?.choices as Array<{ message?: { content?: string } }> | undefined;
    return choices?.[0]?.message?.content || '';
  }
  if (typeof result?.output_text === 'string') return result.output_text;
  const output = result?.output as Array<{ content?: Array<{ type?: string; text?: string }> }> | undefined;
  return output?.flatMap(item => item.content || []).filter(part => part.type === 'output_text').map(part => part.text || '').join('') || '';
}

export function requiresResponsesApi(status: number, detail: string): boolean {
  return status === 400 && /responses? api|\/v1\/responses|not supported.*chat.completions|chat.completions.*not supported/i.test(detail);
}
