// The localStorage flag that marks a browser as having been let into the in-development city pages.
//
// It lives in its own module because TWO places need it — the gate that sets it, and the charts
// gallery that decides whether to list the pages — and if those two ever drift you get the worst
// possible outcome: a browser that is listed but locked, or locked but listed.
//
// ⭐ BUMP THE SUFFIX TO RE-LOCK EVERYONE. The flag is permanent once set, so a browser that was
// unlocked months ago still walks straight in and the pages look public to whoever is holding it.
// Changing the key is the only way to take that back — every existing unlock stops matching at
// once, and everyone (owner included) sees the sign again until they re-enter the passphrase.
export const CITY_KEY = "spx-city-dev2";
