import { db } from '../storage';
import { conversationSchema, type Conversation } from '../learning-records';
import { getScenario, type ConversationLanguage } from './scenarios';
import { getCourse } from '../content/catalog';
import { accountState } from '../sync/client';
export async function startConversation(courseId: string, scenarioId: string, database = db) {
  const course = getCourse(courseId),
    scenario = getScenario(scenarioId),
    now = new Date().toISOString();
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    courseId,
    scenarioId,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    model: accountState().conversation ? 'self-hosted' : 'Qwen3.5-4B-q4f16_1',
    messages: [
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: scenario.openers[course.targetLanguage as ConversationLanguage],
        at: now,
        input: 'model',
      },
    ],
  };
  await database.conversations.add(conversation);
  return conversation;
}
export async function appendMessage(
  id: string,
  expectedLastId: string,
  text: string,
  role: 'user' | 'assistant',
  input: 'voice' | 'text' | 'model',
  database = db,
) {
  return database.transaction('rw', database.conversations, async () => {
    const conversation = conversationSchema.parse(await database.conversations.get(id));
    if (
      conversation.completedAt ||
      conversation.messages.at(-1)?.id !== expectedLastId ||
      conversation.messages.at(-1)?.role === role
    )
      throw Error('This conversation changed. Reload it before replying.');
    if (!text.trim() || text.length > 2000 || conversation.messages.length >= 25)
      throw Error('This conversation is full. Start another to keep practicing.');
    const now = new Date().toISOString();
    const next = conversationSchema.parse({
      ...conversation,
      updatedAt: now,
      messages: [
        ...conversation.messages,
        { id: crypto.randomUUID(), role, text: text.trim(), input, at: now },
      ],
    });
    await database.conversations.put(next);
    return next;
  });
}
export async function finishConversation(id: string, database = db) {
  return database.transaction('rw', [database.conversations, database.events], async () => {
    const conversation = conversationSchema.parse(await database.conversations.get(id));
    if (conversation.completedAt) return;
    const now = new Date().toISOString();
    await database.conversations.put({ ...conversation, updatedAt: now, completedAt: now });
    await database.events.put({
      id: `conversation:${id}`,
      kind: 'conversation',
      courseId: conversation.courseId,
      at: now,
      data: {
        conversationId: id,
        turns: conversation.messages.filter((m) => m.role === 'user').length,
        spoken: conversation.messages.filter((m) => m.input === 'voice').length,
      },
    });
  });
}
