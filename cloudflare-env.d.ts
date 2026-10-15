declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    HUGGINGFACE_SPACE?: string;
    CONVERSATION_URL?: string;
    CONVERSATION_API_KEY?: string;
    CONVERSATION_MODEL?: string;
    TRANSCRIPTION_URL?: string;
    TRANSCRIPTION_API_KEY?: string;
    VOICE_URL?: string;
    VOICE_API_KEY?: string;
  }
}
