// Locked character cast for Toonflow Studio — approved by the owner 2026-10-03.
// These exact designs are used for every video. Reference images are served
// from /characters/* and the video worker frame-checks every clip against them.

export const LOCKED_CHARACTERS = {
  enabled: true,
  images: {
    otter: "/characters/otter-ref.jpg",
    raccoon: "/characters/raccoon-ref.jpg",
    duo: "/characters/duo-ref.jpg",
  },
  dna: `LOCKED CAST (owner-approved 2026-10-03 — never redesign):

OTTER (the inventor): anthropomorphic otter standing upright, long tail. Dark
chocolate-brown fur on back/head/arms/tail; cream-white chest, belly and
muzzle. Brass aviator goggles ALWAYS pushed up on the forehead. Brown leather
tool belt with pouches and tiny tools ALWAYS at the waist. Long white
whiskers, confident smug smirk. Signature expression: proud smirk.

RACCOON (the practical one): small anthropomorphic raccoon, roughly HALF the
otter's height — this scale relationship never changes. Gray fur, darker gray
limbs, classic black mask markings around the eyes, light muzzle. Often holds
a dried palm-leaf fan. Calm, deadpan, quietly amused.

WORLD: sunlit tropical riverbank — turquoise stream, sandy shore, moss-covered
rocks, bamboo groves and tall thin trees, palm fronds, warm golden-hour
cinematic light.

NEVER CHANGE: fur colors, body proportions, face shape, facial features,
otter:raccoon scale, goggles (forehead), tool belt, accessories, world look.
"Keep both completely consistent in every shot — identical fur colors,
proportions and facial features."`,
} as const;
