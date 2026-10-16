/**
 * Areas of the app that are switched off for now. Their code is kept: set a
 * flag back to true to bring the area back (navigation, + menu and routes).
 */
export const FEATURES = {
  /** The Profit Tracker dashboard and the revenue box in the sidebar. */
  profitTracker: false,
  /** Projects: the sidebar tile, recent projects, the projects panel and pages. */
  projects: false,
};

/** Where people land after signing in. */
export const HOME_PATH = FEATURES.profitTracker ? '/profit-tracker' : '/leads';
