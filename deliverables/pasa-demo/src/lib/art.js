import borderZigzag from './assets/pasa/patterns/border-zigzag.webp';
import badgeBaseline from './assets/pasa/badges/badge-baseline.webp';
import badgePassed from './assets/pasa/badges/badge-passed.webp';
import badgeStreak3 from './assets/pasa/badges/badge-streak-3.webp';
import badgeStreak7 from './assets/pasa/badges/badge-streak-7.webp';
import badgeStreak14 from './assets/pasa/badges/badge-streak-14.webp';
import badgeStreak30 from './assets/pasa/badges/badge-streak-30.webp';
import heroDesktop from './assets/pasa/hero/hero-desktop.webp';
import heroMobile from './assets/pasa/hero/hero-mobile-stage.webp';
import heroPassed from './assets/pasa/hero/hero-passed.webp';
import sceneLocked from './assets/pasa/scenes/scene-locked.webp';
import sceneStreak0 from './assets/pasa/scenes/scene-streak-0.webp';
import sceneNoData from './assets/pasa/scenes/scene-no-data.webp';
import sceneError from './assets/pasa/scenes/scene-error.webp';
import sceneSleep from './assets/pasa/scenes/scene-sleep.webp';
import sceneWelcome from './assets/pasa/scenes/scene-welcome.webp';
import sun from './assets/pasa/decor/decor-sun.webp';
import tapeStriped from './assets/pasa/decor/decor-tape-striped.webp';
import tapeTeal from './assets/pasa/decor/decor-tape-teal.webp';
import paperclip from './assets/pasa/decor/decor-paperclip.webp';
import iconPractice from './assets/pasa/icons/icon-practice.webp';
import iconHome from './assets/pasa/icons/icon-home.webp';
import iconMajor from './assets/pasa/icons/icon-major.webp';
import iconTrophy from './assets/pasa/icons/icon-trophy.webp';
import iconStudy from './assets/pasa/icons/icon-study.webp';
import iconTimer from './assets/pasa/icons/icon-timer.webp';
import iconCommunity from './assets/pasa/icons/icon-community.webp';
import iconGenEd from './assets/pasa/icons/icon-gened.webp';
import iconProgress from './assets/pasa/icons/icon-progress.webp';
import iconStreak from './assets/pasa/icons/icon-streak.webp';
import iconProfEd from './assets/pasa/icons/icon-profed.webp';
import iconPlan from './assets/pasa/icons/icon-plan.webp';
import iconNotes from './assets/pasa/icons/icon-notes.webp';
import iconFlashcards from './assets/pasa/icons/icon-flashcards.webp';
import iconDrills from './assets/pasa/icons/icon-drills.webp';
import iconMock from './assets/pasa/icons/icon-mock.webp';
import iconSprint from './assets/pasa/icons/icon-sprint.webp';
import iconErrors from './assets/pasa/icons/icon-errors.webp';
import iconWeak from './assets/pasa/icons/icon-weak.webp';
import iconCountdown from './assets/pasa/icons/icon-countdown.webp';
import iconSettings from './assets/pasa/icons/icon-settings.webp';
import iconProfile from './assets/pasa/icons/icon-profile.webp';
import iconFeedback from './assets/pasa/icons/icon-feedback.webp';
import iconMenu from './assets/pasa/icons/icon-menu.webp';
import buddyDefault from './assets/pasa/buddy/buddy-default.webp';
import buddyThinking from './assets/pasa/buddy/buddy-thinking.webp';
import buddyExplaining from './assets/pasa/buddy/buddy-explaining.webp';
import buddyCheering from './assets/pasa/buddy/buddy-cheering.webp';
import buddyEncouraging from './assets/pasa/buddy/buddy-encouraging.webp';
import buddySleeping from './assets/pasa/buddy/buddy-sleeping.webp';
import buddyAvatar from './assets/pasa/buddy/buddy-avatar.webp';
import textureChalk from './assets/pasa/textures/texture-chalk.webp';
import texturePaper from './assets/pasa/textures/texture-paper.webp';

// One Vite-hashed registry keeps art local, dimensioned, and easy to audit against the offline budget.
export const art = {
  'border-zigzag': { src: borderZigzag, w: 1920, h: 96 },
  'badge-baseline': { src: badgeBaseline, w: 256, h: 255 },
  'badge-passed': { src: badgePassed, w: 244, h: 256 },
  'badge-streak-3': { src: badgeStreak3, w: 196, h: 256 },
  'badge-streak-7': { src: badgeStreak7, w: 249, h: 256 },
  'badge-streak-14': { src: badgeStreak14, w: 243, h: 256 },
  'badge-streak-30': { src: badgeStreak30, w: 237, h: 256 },
  'hero-desktop': { src: heroDesktop, w: 1586, h: 992 },
  'hero-mobile': { src: heroMobile, w: 493, h: 640 },
  'hero-passed': { src: heroPassed, w: 1000, h: 529 },
  'scene-locked': { src: sceneLocked, w: 480, h: 435 },
  'scene-streak-0': { src: sceneStreak0, w: 479, h: 425 },
  'scene-no-data': { src: sceneNoData, w: 430, h: 453 },
  'scene-error': { src: sceneError, w: 420, h: 480 },
  'scene-sleep': { src: sceneSleep, w: 467, h: 450 },
  'scene-welcome': { src: sceneWelcome, w: 480, h: 436 },
  'decor-sun': { src: sun, w: 320, h: 316 },
  'tape-striped': { src: tapeStriped, w: 266, h: 116 },
  'tape-teal': { src: tapeTeal, w: 251, h: 104 },
  'decor-paperclip': { src: paperclip, w: 166, h: 220 },
  'icon-practice': { src: iconPractice, w: 256, h: 238 },
  'icon-home': { src: iconHome, w: 256, h: 249 },
  'icon-major': { src: iconMajor, w: 256, h: 232 },
  'icon-trophy': { src: iconTrophy, w: 256, h: 244 },
  'icon-study': { src: iconStudy, w: 256, h: 177 },
  'icon-timer': { src: iconTimer, w: 256, h: 228 },
  'icon-community': { src: iconCommunity, w: 256, h: 200 },
  'icon-gened': { src: iconGenEd, w: 224, h: 256 },
  'icon-progress': { src: iconProgress, w: 256, h: 245 },
  'icon-streak': { src: iconStreak, w: 229, h: 256 },
  'icon-profed': { src: iconProfEd, w: 256, h: 186 },
  'icon-plan': { src: iconPlan, w: 256, h: 199 },
  'icon-notes': { src: iconNotes, w: 327, h: 327 },
  'icon-flashcards': { src: iconFlashcards, w: 344, h: 283 },
  'icon-drills': { src: iconDrills, w: 312, h: 316 },
  'icon-mock': { src: iconMock, w: 347, h: 316 },
  'icon-sprint': { src: iconSprint, w: 377, h: 246 },
  'icon-errors': { src: iconErrors, w: 318, h: 318 },
  'icon-weak': { src: iconWeak, w: 346, h: 256 },
  'icon-countdown': { src: iconCountdown, w: 359, h: 320 },
  'icon-settings': { src: iconSettings, w: 326, h: 326 },
  'icon-profile': { src: iconProfile, w: 349, h: 358 },
  'icon-feedback': { src: iconFeedback, w: 329, h: 327 },
  'icon-menu': { src: iconMenu, w: 296, h: 253 },
  'buddy-default': { src: buddyDefault, w: 462, h: 414 },
  'buddy-thinking': { src: buddyThinking, w: 457, h: 445 },
  'buddy-explaining': { src: buddyExplaining, w: 512, h: 396 },
  'buddy-cheering': { src: buddyCheering, w: 498, h: 457 },
  'buddy-encouraging': { src: buddyEncouraging, w: 337, h: 448 },
  'buddy-sleeping': { src: buddySleeping, w: 497, h: 442 },
  'buddy-avatar': { src: buddyAvatar, w: 512, h: 512 },
  'texture-chalk': { src: textureChalk, w: 512, h: 512 },
  'texture-paper': { src: texturePaper, w: 512, h: 512 }
};

export function getArt(name) {
  return art[name] ?? null;
}
