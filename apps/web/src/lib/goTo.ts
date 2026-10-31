/** Sends the browser to another site (back to an assistant). A module of its own so tests can watch it. */
export const goTo = (url: string) => window.location.assign(url);
