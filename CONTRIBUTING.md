# Contributing to Paso

Thank you for helping make language learning more accessible. Contributions can be code, lessons, translation, language review, accessibility findings, or real-device reports.

## Your first contribution

1. Read the [README](README.md) and [setup guide](docs/setup.md), then run the app locally.
2. Search [existing issues](https://github.com/sulmatajb/paso/issues). Open an issue before a large feature, new course, model replacement, or storage change so we can agree on scope.
3. Fork the repository and create a short branch, for example `fix/lesson-keyboard-focus`.
4. Make one focused change. Add regression coverage for behavior such as grading, progress, sync, or interrupted sessions. Documentation-only fixes do not need invented tests.
5. Run the checks relevant to your change, then open a pull request explaining the learner-facing result and what you actually tested.

For application changes, run `npm run check`, `npm test`, `npm run format:check`, and `npm run build`. Run `npm run test:e2e` after initializing a fresh local database and installing Playwright browsers as described in [setup](docs/setup.md). CI uses controlled server responses; do not consume a shared Space's GPU quota in ordinary tests.

## Good places to start

- Review one Spanish lesson for naturalness, instructions, hints, and missing accepted answers. Include course/lesson/exercise IDs and your reasoning.
- Test a lesson and conversation on a physical iPhone or Android phone. Report browser, OS, permissions, network, and exact reproduction steps; remove personal transcripts.
- Fix keyboard navigation, focus, a narrow-screen overflow, or an inaccurate setup instruction.
- Translate a small, agreed set of interface strings and have a fluent speaker review them.

The [roadmap](ROADMAP.md) explains larger priorities. A proposal is not an assignment or a promise of a release date.

## Lessons, translations, and audio

Use [the course guide](docs/courses.md). Provide original or compatibly licensed material, its author, and its license. Include accepted-answer cases and request fluent-speaker review. Do not copy proprietary courses, artwork, or transcripts from learners.

Keep shipped IDs stable. Meaning or sequence changes need a deliberate version/migration plan so existing learners retain progress. New course content needs matching generated voice clips, source/license notices, and a passing `python3 scripts/audio/validate.py` run. Follow [the speech guide](docs/speech.md). Teacher review and listening checks remain necessary even when automated tests pass.

## Code and model changes

- Keep guest learning usable without a paid external service; do not add tracking.
- Preserve cancellation, retry, offline behavior, and account/guest separation.
- Check phone layouts, keyboard use, visible focus, contrast, and reduced motion.
- Keep model downloads explicit. Document model revisions, licenses, resource requirements, and privacy changes.
- Separate real inference benchmarks from deterministic CI. Never claim a controlled fixture proves real model quality.
- Never commit tokens, `.dev.vars`, `.env`, learner exports, model weights, Python environments, or generated build output.

Report vulnerabilities privately through [GitHub security advisories](https://github.com/sulmatajb/paso/security/advisories/new), not a public issue. See [SECURITY.md](SECURITY.md).

## Review and community

Be kind, specific, and open to correction. Discuss the work rather than the person. Harassment, discriminatory remarks, and publishing another person's private information are not acceptable. Maintainers may remove abusive content and restrict participation.

PR descriptions should explain the problem, the resulting behavior, tests run, and limitations. Use screenshots for visible UI changes. Disclose generated content and verify its facts and licensing; you remain responsible for the contribution. Maintainers may ask for a smaller scope or additional review. There is no guaranteed response time.

## Licensing

Application contributions are **AGPL-3.0-only**. Original course content contributions are **CC BY-SA 4.0**. Preserve compatible third-party notices. By submitting a contribution, you confirm you have the right to provide it under the applicable project license. No CLA or copyright assignment is required.
