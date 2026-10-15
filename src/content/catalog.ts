import { validateCourse } from './schema';
// Adding a course file adds it to the catalog; the engine has no Spanish-specific branch.
const modules = import.meta.glob('./courses/*.json', { eager: true, import: 'default' });
export const courses = Object.values(modules)
  .map(validateCourse)
  .sort((a, b) =>
    a.id === 'es-from-en' ? -1 : b.id === 'es-from-en' ? 1 : a.id.localeCompare(b.id),
  );
if (new Set(courses.map((c) => c.id)).size !== courses.length)
  throw new Error('Course IDs must be unique.');
export function getCourse(id: string) {
  const course = courses.find((c) => c.id === id);
  if (!course) throw new Error(`Unknown course: ${id}`);
  return course;
}
export function getLesson(courseId: string, lessonId: string) {
  const lesson = getCourse(courseId).lessons.find((l) => l.id === lessonId);
  if (!lesson) throw new Error(`Unknown lesson: ${lessonId}`);
  return lesson;
}
export const languageNames: Record<string, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
};
