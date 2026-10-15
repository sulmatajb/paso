import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { handleInference } from '../../../server/inference';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return handleInference(request, env, (await getChatGPTUser())?.userId ?? null, 'voice');
}
