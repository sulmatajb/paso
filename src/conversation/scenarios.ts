export const scenarios = [
  {
    id: 'open',
    title: 'Let’s just talk.',
    place: 'Open conversation',
    icon: '💬',
    description: 'Talk about your day, your interests, or whatever is on your mind.',
    role: 'a patient language-exchange partner having a natural conversation about the learner’s chosen topic',
    goals: [
      'Share something about your day',
      'Ask your partner a question',
      'Try a follow-up in your own words',
    ],
    openers: {
      es: '¡Hola! ¿De qué te gustaría hablar hoy?',
      fr: 'Salut ! De quoi voudrais-tu parler aujourd’hui ?',
      en: 'Hi! What would you like to talk about today?',
    },
    starters: {
      es: ['Hoy he…', 'Me gusta…', '¿Qué te gusta hacer?'],
      fr: ['Aujourd’hui, je…', 'J’aime…', 'Qu’est-ce que tu aimes faire ?'],
      en: ['Today, I…', 'I enjoy…', 'What do you like doing?'],
    },
  },
  {
    id: 'cafe',
    title: 'Your usual, please.',
    place: 'At the café',
    icon: '☕',
    description: 'Order something you like, ask a question, and pay.',
    role: 'a friendly café server',
    goals: ['Say hello and place an order', 'Ask about an item or price', 'Ask to pay'],
    openers: {
      es: '¡Hola! Bienvenido. ¿Qué te gustaría tomar?',
      fr: 'Bonjour ! Qu’est-ce que vous voulez boire ?',
      en: 'Hello! Welcome in. What would you like to drink?',
    },
    starters: {
      es: ['Quisiera un café con leche.', '¿Cuánto cuesta un té?', '¿Puedo pagar con tarjeta?'],
      fr: ['Je voudrais un café au lait.', 'Combien coûte un thé ?', 'Je peux payer par carte ?'],
      en: ['I would like a coffee with milk.', 'How much is a tea?', 'Can I pay by card?'],
    },
  },
  {
    id: 'meet',
    title: 'Make a new friend.',
    place: 'First introductions',
    icon: '👋',
    description: 'Introduce yourself and learn something about someone new.',
    role: 'a friendly new acquaintance at a language exchange',
    goals: ['Introduce yourself', 'Ask a question about your partner', 'Share something you enjoy'],
    openers: {
      es: '¡Hola! Me llamo Maya. ¿Cómo te llamas?',
      fr: 'Salut ! Je m’appelle Maya. Comment tu t’appelles ?',
      en: 'Hi! My name is Maya. What is your name?',
    },
    starters: {
      es: ['Me llamo…', '¿De dónde eres?', 'Me gusta escuchar música.'],
      fr: ['Je m’appelle…', 'Tu viens d’où ?', 'J’aime écouter de la musique.'],
      en: ['My name is…', 'Where are you from?', 'I like listening to music.'],
    },
  },
  {
    id: 'town',
    title: 'Find your way.',
    place: 'Around town',
    icon: '🧭',
    description: 'Ask for directions and check that you understood.',
    role: 'a helpful local giving simple fictional directions in a town',
    goals: ['Ask where a place is', 'Ask one follow-up question', 'Check the directions'],
    openers: {
      es: 'Hola, ¿necesitas ayuda para encontrar un lugar?',
      fr: 'Bonjour, vous cherchez un endroit ?',
      en: 'Hello! Do you need help finding somewhere?',
    },
    starters: {
      es: ['¿Dónde está la estación?', '¿Está lejos?', 'Entonces, giro a la izquierda, ¿verdad?'],
      fr: ['Où est la gare ?', 'C’est loin ?', 'Je tourne à gauche, c’est ça ?'],
      en: ['Where is the station?', 'Is it far?', 'So I turn left, right?'],
    },
  },
  {
    id: 'weekend',
    title: 'Make a little plan.',
    place: 'Weekend with a friend',
    icon: '🌤',
    description: 'Choose an activity and agree on a time and place.',
    role: 'a friend making simple weekend plans',
    goals: ['Suggest an activity', 'Agree on a time', 'Choose where to meet'],
    openers: {
      es: '¡Hola! ¿Qué te gustaría hacer este fin de semana?',
      fr: 'Salut ! Qu’est-ce que tu veux faire ce week-end ?',
      en: 'Hi! What would you like to do this weekend?',
    },
    starters: {
      es: ['¿Quieres ir al parque?', '¿A qué hora nos vemos?', 'Nos vemos en la entrada.'],
      fr: [
        'Tu veux aller au parc ?',
        'On se retrouve à quelle heure ?',
        'On se retrouve à l’entrée.',
      ],
      en: [
        'Would you like to go to the park?',
        'What time should we meet?',
        'Let’s meet at the entrance.',
      ],
    },
  },
] as const;
export type Scenario = (typeof scenarios)[number];
export type ConversationLanguage = 'es' | 'fr' | 'en';
export const getScenario = (id: string) => {
  const scenario = scenarios.find((s) => s.id === id);
  if (!scenario) throw Error('Unknown conversation');
  return scenario;
};
export function conversationPrompt(language: string, scenario: Scenario) {
  const name = ({ es: 'Spanish', fr: 'French', en: 'English' } as Record<string, string>)[language];
  const city = ({ es: 'Valencia', fr: 'Lyon', en: 'Bristol' } as Record<string, string>)[language];
  return `You are Maya, a friendly ${name} conversation partner. Your fictional home is ${city}, and you enjoy cooking pasta and hiking. The user is a different person. Reply only in ${name}, using one or two short, grammatically correct sentences. Answer the latest question first, then ask at most one relevant follow-up. Continue the topic without repeating introductions. In this scene, you are ${scenario.role}.`;
}
export function cleanReply(raw: string) {
  if (/<think>/i.test(raw) && !/<\/think>/i.test(raw))
    throw Error('The model did not finish its reply. Try again.');
  const text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\|[^>]*\|>/g, '')
    .replace(/^[\s\n]*(assistant|response|reply)\s*:\s*/i, '')
    .trim();
  if (!text || text.length > 2000)
    throw Error('The model returned an incomplete reply. Try again.');
  return text;
}
