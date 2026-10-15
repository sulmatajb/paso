import { env } from 'cloudflare:workers';
import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from '../../chatgpt-auth';
import { json } from '../../../server/progress';
export const dynamic = 'force-dynamic';
export async function GET() {
  const communitySpace =
    env.HUGGINGFACE_SPACE && /^[a-zA-Z0-9][\w.-]*\/[a-zA-Z0-9][\w.-]*$/.test(env.HUGGINGFACE_SPACE)
      ? env.HUGGINGFACE_SPACE
      : null;
  return json({
    communitySpace,
    user: await getChatGPTUser(),
    signIn: chatGPTSignInPath('/#account'),
    signOut: chatGPTSignOutPath('/#account'),
    conversation: !!(communitySpace || env.CONVERSATION_URL),
    voice: !!(communitySpace || env.VOICE_URL),
    transcription: !!(communitySpace || env.TRANSCRIPTION_URL),
  });
}
