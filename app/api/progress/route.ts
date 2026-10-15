import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { handleProgress, json } from '../../../server/progress';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  try {
    return await handleProgress(request, env.DB, (await getChatGPTUser())?.userId ?? null);
  } catch (error) {
    console.error('Progress request failed', error instanceof Error ? error.name : 'Error');
    return json(
      { error: 'Sync is temporarily unavailable. Your progress is saved on this device.' },
      503,
    );
  }
}
export const GET = handle,
  PUT = handle,
  DELETE = handle;
