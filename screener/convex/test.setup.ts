/// <reference types="vite/client" />
// Every Convex module, for convex-test.
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");
