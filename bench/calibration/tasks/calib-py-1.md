# Color: CMYK and CSS color strings, harmonious palettes, contrast pairs and three more color-name locales

## Summary

The `color` provider can produce a hex, RGB, HSL or HSV value and a localized
color name, but front-end, print and design-system test fixtures need more:

- print pipelines and PDF generators work in CMYK;
- CSS tests need every modern CSS color notation (`hsl()`, `hwb()`, `rgba()`
  with an alpha channel), not just `rgb()`;
- theme and design-token tests need _sets_ of colors that belong together
  (a complementary pair, a triadic set, a palette of shades of one hue), and
  accessibility tests need foreground/background pairs with a known WCAG
  contrast ratio.

Faker should also name colors in Italian, Dutch and Polish; today those
locales fall back to the English names.

## 1. New color formats

`RandomColor.generate()` (and therefore `Faker.color()`) accepts new values for
`color_format`, next to the existing `hex`, `rgb`, `hsl`, `hsv`:

| `color_format` | Example                    |
| -------------- | -------------------------- |
| `cmyk`         | `cmyk(0%, 62%, 81%, 12%)`  |
| `hwb`          | `hwb(21 13% 12%)`          |
| `rgba`         | `rgba(224, 85, 43, 0.73)`  |
| `hsla`         | `hsla(14, 75%, 52%, 0.73)` |

New provider methods (all of them honour `hue` and `luminosity` like
`color()` does):

- `color_cmyk(hue=None, luminosity=None) -> Tuple[int, int, int, int]`
  (percentages 0–100);
- `cmyk_color()` — the CSS-like string;
- `hsl_css_color()`, `hwb_css_color()` — CSS strings;
- `rgba_css_color(alpha=None)` — `alpha` is a float between 0 and 1; when it is
  `None`, a random alpha with two decimals is used.

The conversions (HSV to CMYK, HSV to HWB) live next to the existing
`hsv_to_rgb` / `hsv_to_hsl` class methods of `RandomColor`. Validation errors
for an unknown `color_format` stay `ValueError` with a message that lists the
accepted formats.

## 2. Palettes

`color_palette(scheme="analogous", size=None, hue=None, luminosity=None,
color_format="hex") -> List[str]`:

- schemes: `monochromatic`, `analogous`, `complementary`,
  `split_complementary`, `triadic`, `tetradic`;
- the base hue is picked like `color()` picks it (so `hue="blue"` works), the
  other hues are derived from it by the scheme's angles (wrapping at 360);
- `size` defaults to the natural size of the scheme (2 for complementary, 3 for
  triadic and split complementary, 4 for tetradic, 5 for analogous and
  monochromatic); larger sizes repeat the scheme's hues with varied brightness;
- an unknown scheme or a size below 1 raises `ValueError`.

## 3. Contrast pairs

- `contrast_ratio(color_a, color_b) -> float` is a static helper on the
  provider module that accepts `#rrggbb` strings and implements the WCAG 2.x
  relative-luminance formula.
- `color_pair(min_contrast=4.5, max_tries=100) -> Tuple[str, str]` returns a
  foreground/background pair of hex colors whose contrast ratio is at least
  `min_contrast`; it raises `ValueError` for a ratio outside 1–21 and gives up
  with a `ValueError` after `max_tries` attempts.

## 4. Localized color names

New locale modules `color/it_IT`, `color/nl_NL` and `color/pl_PL` with
`all_colors` (the same 140 web colors the base provider has, translated, as an
`OrderedDict` of name to hex) and `safe_colors`, following the existing
`fr_FR` / `de_DE` modules.

## Acceptance

- New tests in `tests/providers/test_color.py` cover each format, each
  conversion (with known reference values), each palette scheme, the WCAG
  formula (black on white is 21, a color on itself is 1) and the three new
  locales.
- `faker/proxy.pyi` is regenerated with `generate_stubs.py`.
- The full test suite, flake8, isort, black and mypy pass.
