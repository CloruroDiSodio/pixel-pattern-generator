/**
 * Single source of truth for the user-facing release number.
 *
 * Bump this for every user-visible change and add a `CHANGELOG.md` entry in the
 * same commit - it is what the footer renders and what readers compare against
 * the changelog. Kept in step with `backend/app/__init__.py:__version__`, which
 * the API reports from `/` and `/api/health`.
 */
export const APP_VERSION = '1.2.0';