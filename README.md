# Jousting

A medieval jousting tournament for the browser. Choose your horse, paint your arms, pick your harness
and helm, then ride against five champions of the realm, one after another. Beat them all and the crowd
crowns you Champion.

It runs on WebGPU with a small rendering engine borrowed from [Tidewater](https://github.com/dgreenheck/tidewater).
The sky is a real one: a CC0 HDRI panorama from [Poly Haven](https://polyhaven.com/a/quarry_01) lights the scene
and shows in every reflection on the plate armour. Everything else (knights, horses, crowd, woods, terrain, the
materials, heraldry and audio) is built in code.

## Run it

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:5190 in a browser with WebGPU (a recent Chrome, Edge or Safari).

## How to joust

| Input | Action |
|---|---|
| <kbd>W</kbd>, <kbd>Shift</kbd> or hold the left mouse button | Spur your horse |
| Mouse, or the arrow keys | Aim your lance (the ring shows where it will strike) |
| <kbd>Space</kbd> or right-click | Brace your shield. Press it just before the lances meet |
| <kbd>Esc</kbd> | Pause |
| <kbd>M</kbd> | Sound on or off |

- A bout is three passes. A hit on the **helm** scores 3, the **breastplate** 2, and the **shield** 1.
- Unhorse your opponent and you win at once. A level score after three passes goes to sudden death.
- Speed and your horse's power make a strike hit harder. Your horse's steadiness makes the lance sway less.
- A braced shield swings across your body and turns breastplate hits into shield hits. A perfect brace also
  makes you much harder to unhorse.
- You can lose two bouts and ride them again. A third defeat ends your tournament.

## The tournament

1. **Sir Aldric the Green**, a hedge knight
2. **Dame Isolde of Ravensmoor**
3. **Sir Bertrand le Rouge**
4. **The Black Knight of Ashfell**
5. **Sir Godfrey the Unbroken**, the King's Champion

## Make your knight

- **Horse**: five mounts with different speed, acceleration, power and steadiness.
- **Arms**: 14 field divisions, 8 tinctures and 13 charges (lion, eagle, fleur-de-lis, tower, crown, and more).
  Your arms appear on your shield, surcoat, caparison and lance.
- **Armour**: five finishes, five helms (great helm, frog-mouth, hounskull, armet, open barbute) and a plume.
- **Knight**: name, face, hair and beard.

Your knight is saved in the browser.

## Project layout

| Path | What it holds |
|---|---|
| `src/engine` | The WebGPU engine from Tidewater (scene graph, materials as WGSL snippets, shadows) |
| `src/core` | The frame renderer (shadows, haze, tone mapping) and input |
| `src/game` | Pure game logic: joust rules, AI, tournament, heraldry painter, options. No GPU, tested in Node |
| `src/world` | The arena, terrain, woods, crowd, knights and horses, the sky panorama and image-based lighting, shared materials and the heraldry atlas |
| `public/assets` | The HDRI sky panorama |
| `src/fx`, `src/audio` | Particles (splinters, dust, confetti) and synthesised sound |
| `src/ui` | Menus and the HUD |
| `test` | `game-logic.mjs` (rules), `environment.mjs` (HDRI reader, terrain), `engine-smoke.mjs`, and headless renders of the arena and knights |

## Tests

```bash
npm test
```

To render the arena or the knights to PNG files without a browser (on a machine with no GPU, install a software
Vulkan driver such as Mesa's lavapipe, `mesa-vulkan-drivers` on Debian and Ubuntu):

```bash
node test/render-arena.mjs /tmp
```

```bash
node test/render-knight.mjs /tmp
```
