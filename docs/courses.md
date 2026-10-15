# Course packages

Add a JSON file in `src/content/courses/`. The catalog discovers all files at build time and validates them with Zod. Reuse the structure of an existing package.

A course has `schemaVersion: 2`, a stable `id`, a numeric `version`, BCP 47 `sourceLanguage` and `targetLanguage`, a title/description, a primary unit, optional `units[]`, lessons, and a content license. Instructions, hints, explanations, and translations are authored in the source language. Keep `languageNames` and the greeting artwork in the UI catalog current when adding another language.

Each lesson has a stable ID/version, title/subtitle, optional `unitId` (defaults to the primary unit), estimated minutes, prerequisite lesson IDs, phrase records, and exercises. Prerequisites must refer to earlier lessons in the package. A phrase has an ID, target text, source-language translation, and a usage note. IDs must be unique within the enclosing course/lesson. `acceptedAnswers` on a phrase is optional authoring metadata; lesson grading uses the explicit `answers` array on writing/listening/speaking exercises. Typed recall uses the target plus these accepted alternatives.

Every exercise refers to a phrase ID and provides title, instruction, hint, and explanation. Supported variants:

| Type       | Payload                                             | Grading                                                                  |
| ---------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `choice`   | `options`, `answer`                                 | Exact option                                                             |
| `order`    | `tokens`, `answer` array                            | Exact order; token multisets must agree                                  |
| `write`    | `answers`                                           | Any explicitly accepted answer after normalization                       |
| `listen`   | `answers`                                           | Same as writing; audio uses the referenced phrase's exact target         |
| `speak`    | `answers`                                           | Recognized words after speech normalization; typing is assisted          |
| `dialogue` | `turns: [{speaker, phraseId}]`, `options`, `answer` | Exact reply option; preceding turns reference phrases in the same lesson |
| `match`    | `pairs` of `left`/`right`                           | Complete one-to-one mapping                                              |

Writing normalization accepts capitalization, whitespace, ordinary punctuation, and straight/typographic apostrophes. It preserves diacritics and word content. Add alternatives explicitly; do not remove accents globally. Every listening exercise must accept its audio phrase exactly. A transcript is an assisted hint, not an unassisted listening success.

## Progress identity and migrations

Lesson keys are `courseId:lessonId`; review/audio keys are `courseId/lessonId/phraseId`. Pairs therefore have independent progress even if they share vocabulary. Completing a lesson creates its cards once. Multiple lessons can introduce distinct phrase records, including contextual variations.

Do not rename or repurpose shipped IDs. For meaning/answer/sequence changes, increment the course version and supply a deliberate IndexedDB migration in `src/storage.ts`. Per-lesson versions are authoring metadata; the persisted compatibility gate is the course version. Unknown saved versions fail visibly rather than resetting learners. Adding a new course does not require touching the scheduler. The existing DB v1→v2 migration preserves phase-one attempts/XP and its original backup table.

## Audio and quality

Run the pipeline in [speech.md](speech.md). Every phrase must have every configured target-language voice. Audio URLs are keyed by stable IDs plus a hash query for browser cache invalidation. Do not add languages unsupported by the selected model without adding another openly licensed speech backend and its provenance.

Run `npm test`, audio validation, and the complete browser journey. Add tests for new exercise types or migration behavior. Ask a fluent educator to check naturalness, translations, alternatives, instructions, and every voice clip. Automated consistency and decode checks do not substitute for that review. Document source/license attribution for contributed content.

The current UI dictionary includes English and Spanish. Additional source languages also need their interface translations and a selector option in `src/i18n.tsx` / settings. Course-target text uses its declared `lang` independently of the interface language.

## Append-only expansion

Phase three appends 20 Spanish lessons without changing the original five lesson payloads except `unitId`. Course version stays 1, so existing identities/answers/progress remain compatible. DB v3 adds the mistakes table; optional review fields and the daily goal have safe read defaults for v2 records. Content quality is an ongoing editorial task: automated answer/reference checks do not establish teaching effectiveness.
