# Design: Game Show Flat

Style reference: Lemo-Opuscar `styles/game-show` (Game Show Flat). We borrow only its look (no film code).

**Why this one:** a daily review is a quiz show. Each card is a "round", grading gets a judgement word ("Đỉnh quá!", "Ối dồi ôi!"), and the bright candy sets with their thick ink outlines read as a game, not homework. It is also flat vector, so it is cheap to render in a WKWebView and easy to copy into the Scriptable widget.

## Rules
- One near-black ink outline (3–4px) on everything, with **hard offset shadows** (`5px 5px 0 ink`). No blur, no soft gradients.
- Each card gets a new **set**: a saturated background with diagonal stripes one step lighter. Neighbouring cards never share a hue.
- The card is cream. Big words are white or yellow with an ink stroke under the fill (telop).
- Motion: cards drop in with a back-ease, judgement words stamp in, a bean mascot hops. All of it is off under `prefers-reduced-motion`.

## Palette
| Token | Hex | Use |
|---|---|---|
| ink | `#1C1530` | outlines, shadows, main text |
| cream | `#FFF4DF` | cards, stickers |
| white | `#FFFFFF` | buttons, meo box |
| red | `#FF5A5F` | pinyin, "Quên", "Từ mới!" banner |
| yellow | `#FFD23F` | primary button, meaning sticker, "Hơi nhớ", learning bar |
| green | `#3DDC84` | "Nhớ rồi", mastered bar |
| pink | `#FF7EB6` | lapses ≥3 warning and meo, cheeks |
| sky | `#4CC3F0` | mascot body |

Set backgrounds (bg / stripe), rotated per card:
`#6C4FC4/#7A5FD0` grape · `#FF9F43/#FFB063` tangerine · `#3FB7EA/#5CC4EF` sky · `#FF77AE/#FF8DBC` bubblegum · `#22B39F/#3BC2AE` teal · `#8BD346/#9CDB60` lime

For the widget: grape `#6C4FC4` background, cream `#FFF4DF` hanzi, yellow `#FFD23F` for the meaning, red `#FF5A5F` for pinyin (on cream), or white text on grape.

## Fonts (Google Fonts, with system fallbacks)
- Display (Latin + Vietnamese): **Baloo 2** 700/800, which has a Vietnamese subset. Fredoka from the reference has no Vietnamese, so it is not used.
- Body: **Nunito** 600/800/900 (Vietnamese and pinyin tone marks).
- Chinese: **Noto Sans SC** 700/900, then `PingFang SC`, `Hiragino Sans GB`, `Microsoft YaHei`.
- Widget (system fonts only): SF Rounded heavy for Latin, PingFang SC semibold for hanzi.
