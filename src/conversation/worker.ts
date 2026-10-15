import { CreateMLCEngine, type MLCEngine } from '@mlc-ai/web-llm';
import lock from '../../scripts/models/conversation.lock.json';
let engine: MLCEngine | null = null;
const modelId = lock.model.split('/').at(-1)!;
self.onmessage = async ({ data }) => {
  try {
    if (!engine)
      engine = await CreateMLCEngine(modelId, {
        appConfig: {
          model_list: [
            {
              model: `https://huggingface.co/${lock.model}/resolve/${lock.revision}/`,
              model_id: modelId,
              model_lib: lock.library.url,
              required_features: ['shader-f16'],
              overrides: { context_window_size: 2048, max_history_size: 1 },
            },
          ],
        },
        initProgressCallback: (p) =>
          self.postMessage({ type: 'progress', text: p.text, progress: p.progress }),
      });
    if (data.type === 'load') {
      self.postMessage({ id: data.id, type: 'ready' });
      return;
    }
    const response = await engine.chat.completions.create({
      messages: data.messages,
      max_tokens: 150,
      temperature: 0.4,
      top_p: 0.8,
      repetition_penalty: 1.0,
      extra_body: { enable_thinking: false },
    });
    self.postMessage({ id: data.id, type: 'result', text: response.choices[0].message.content });
  } catch (error) {
    self.postMessage({
      id: data.id,
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
