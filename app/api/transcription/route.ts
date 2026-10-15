import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { handleTranscription } from '../../../server/transcription';
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  return handleTranscription(request, env, user?.userId ?? null);
}
